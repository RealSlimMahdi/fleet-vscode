// The study workbench: the Fleet view, the commands behind it, Fleet tasks,
// spec ↔ code navigation, and Fleet's MCP server offered to Copilot.
//
// Fleet owns every clinical decision. This module only chooses what to ask
// it, in which folder, and how to show the answer.

import * as path from "node:path";

import * as vscode from "vscode";

import { callTool, names } from "./mcp.ts";
import { registerNavigation } from "./navigation.ts";
import type { DerivationRow } from "./spec.ts";
import { derivationEdits, parseSpec } from "./spec.ts";
import type { DatasetRef, Standard, Study } from "./study.ts";
import {
  datasetsOf,
  findStudies,
  fleetCommand,
  outputOf,
  programOf,
  relative,
  standardsOf,
  stat,
  STANDARD_LABELS,
} from "./study.ts";
import { FleetTaskProvider, runFleet } from "./tasks.ts";
import { Item, StudyTree } from "./tree.ts";

/** A command target: a whole study, or one of its datasets. */
interface Picked {
  study: Study;
  ref?: DatasetRef;
}

/** `fleet_dataset_check` as documented in Fleet's mcp_server.py. */
interface DatasetCheck {
  is_valid?: boolean;
  missing_columns?: string[];
  extra_columns?: string[];
  type_mismatches?: { variable: string; define_type: string; actual_dtype: string }[];
  errors?: string[];
  warnings?: string[];
  info?: string[];
}

/** One row of `fleet_code_to_spec`. */
interface ConvertedCall {
  name: string;
  verb: string;
  standard: string;
  line: number;
  status: "ok" | "stub" | "unsupported" | "unknown";
  block: Record<string, unknown> | null;
  reason: string;
  meta: { label?: string };
}

const DATASET_FILES = { Datasets: ["parquet", "csv", "xpt", "sas7bdat"] };

export function registerWorkbench(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  const tree = new StudyTree();
  const diagnostics = vscode.languages.createDiagnosticCollection("fleet");
  // `fleet.hasStudy` gates the Python editor-title button, so it must be right
  // from activation and after every change, whether or not the view is visible.
  const syncContext = () =>
    findStudies().then((studies) =>
      vscode.commands.executeCommand("setContext", "fleet.hasStudy", studies.length > 0),
    );
  void syncContext();
  context.subscriptions.push(
    tree,
    diagnostics,
    tree.onDidChangeTreeData(() => void syncContext()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
    vscode.window.registerTreeDataProvider("fleet.study", tree),
    vscode.tasks.registerTaskProvider("fleet", new FleetTaskProvider()),
    vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task.definition.type !== "fleet") return;
      tree.refresh();
      diagnostics.clear(); // a rerun makes an earlier conformance check moot
    }),
    vscode.workspace.onDidChangeTextDocument((event) => diagnostics.delete(event.document.uri)),
    vscode.lm.registerMcpServerDefinitionProvider("fleet.mcp", {
      provideMcpServerDefinitions: async () => (await findStudies()).map(mcpDefinition),
    }),
  );
  registerNavigation(context);

  const register = (id: string, handler: (arg?: unknown) => unknown) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (arg?: unknown) => {
        try {
          return await handler(arg);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          output.appendLine(`${id}: ${message}`);
          // Fleet's validation dumps run long; the toast gets the gist, the log the whole.
          const gist = message.length > 300 ? `${message.slice(0, 300)}…` : message;
          if (await vscode.window.showErrorMessage(`Fleet: ${gist}`, "Show Log")) output.show();
        }
      }),
    );

  register("fleet.refresh", () => tree.refresh());
  register("fleet.newStudy", newStudy);

  register("fleet.check", async (arg) => {
    const study = await pickStudy(arg);
    if (study) await runFleet(study.root, "check");
  });

  register("fleet.doctor", async (arg) => {
    // Useful precisely when there is no study yet, so fall back to the workspace folder.
    const root = (await findStudies()).length
      ? (await pickStudy(arg))?.root
      : vscode.workspace.workspaceFolders?.[0]?.uri;
    if (root) await runFleet(root, "doctor");
  });

  register("fleet.run", async (arg) => {
    const picked = await pickDataset(arg, true);
    if (!picked) return;
    await runFleet(
      picked.study.root,
      "run",
      picked.ref ? ["--dataset", picked.ref.dataset.name] : [],
    );
  });

  register("fleet.validate", async (arg) => {
    const picked = await pickDataset(arg, true);
    if (!picked) return;
    const { study, ref } = picked;
    const targets = ref ? [relative(study.root, await builtOutput(ref))] : [];
    const report = await reportPath(
      study,
      `validation_${ref?.dataset.name.toLowerCase() ?? "all"}.html`,
    );
    const code = await runFleet(study.root, "validate", [...targets, "--report", report]);
    const subject = ref?.dataset.name ?? "All datasets";
    if (code === 0) await offerReport(study, report, `${subject}: validation passed.`);
    else if (code === 1)
      await offerReport(study, report, `${subject}: validation found errors.`, true);
  });

  register("fleet.compare", async (arg) => {
    const picked = await pickDataset(arg);
    if (!picked?.ref) return;
    const { study, ref } = picked;
    const candidate = await builtOutput(ref);
    const [base] =
      (await vscode.window.showOpenDialog({
        title: `QC dataset to compare ${ref.dataset.name} against`,
        openLabel: "Compare",
        canSelectMany: false,
        filters: DATASET_FILES,
        defaultUri: study.root,
      })) ?? [];
    if (!base) return;
    const keys = await vscode.window.showInputBox({
      title: `Observation keys for ${ref.dataset.name}`,
      prompt: "Variables identifying one observation on each side — prefilled from the spec's keys",
      value: ref.dataset.keys.join(","),
      validateInput: (value) =>
        value.split(",").some((key) => key.trim()) ? undefined : "At least one key is required.",
    });
    if (!keys) return;
    const report = await reportPath(study, `compare_${ref.dataset.name.toLowerCase()}.html`);
    const code = await runFleet(study.root, "compare", [
      base.fsPath,
      candidate.fsPath,
      "--keys",
      keys.replaceAll(/\s+/g, ""),
      "--report",
      report,
    ]);
    if (code === 0) await offerReport(study, report, `${ref.dataset.name} matches the QC dataset.`);
    else if (code === 1)
      await offerReport(study, report, `${ref.dataset.name} differs from the QC dataset.`, true);
  });

  register("fleet.checkDataset", async (arg) => {
    const picked = await pickDataset(arg);
    if (!picked?.ref) return;
    const { study, ref } = picked;
    const output = await builtOutput(ref);
    const result = (await ask(
      study,
      "fleet_dataset_check",
      {
        data_path: output.fsPath,
        define_yaml: ref.standard.spec.fsPath,
        dataset: ref.dataset.name,
      },
      `Fleet: checking ${ref.dataset.name} against its spec`,
    )) as DatasetCheck;
    const found = conformance(ref, result, relative(study.root, output));
    diagnostics.set(ref.standard.spec, found);
    if (found.length) {
      await vscode.commands.executeCommand("workbench.actions.view.problems");
    } else {
      void vscode.window.showInformationMessage(
        `${ref.dataset.name} conforms to its define.yaml declaration.`,
      );
    }
  });

  register("fleet.impact", async (arg) => {
    const picked = await pickDataset(arg);
    if (!picked?.ref) return;
    const { study, ref } = picked;
    const impacted = names(
      await ask(
        study,
        "fleet_impacted_by",
        { spec_paths: await specPaths(study), node: ref.dataset.name },
        `Fleet: what changes downstream of ${ref.dataset.name}`,
      ),
    );
    const declared = new Map((await datasetsOf(study)).map((entry) => [entry.dataset.name, entry]));
    const chosen = await vscode.window.showQuickPick(
      impacted.map((name, index) => ({
        label: `${index + 1}. ${name}`,
        description: describe(declared.get(name)),
        picked: declared.has(name),
        name,
        runnable: declared.has(name),
      })),
      {
        title: `Downstream of ${ref.dataset.name}: ${impacted.length} node(s), in rerun order`,
        placeHolder: "Datasets to rebuild — raw inputs are listed for context only",
        canPickMany: true,
      },
    );
    const datasets = chosen?.filter((entry) => entry.runnable).map((entry) => entry.name) ?? [];
    if (datasets.length)
      await runFleet(
        study.root,
        "run",
        datasets.flatMap((name) => ["--dataset", name]),
      );
  });

  register("fleet.executionOrder", async (arg) => {
    const study = await pickStudy(arg);
    if (!study) return;
    const order = names(
      await ask(
        study,
        "fleet_execution_order",
        { spec_paths: await specPaths(study) },
        "Fleet: computing the execution order",
      ),
    );
    const declared = new Map((await datasetsOf(study)).map((entry) => [entry.dataset.name, entry]));
    const chosen = await vscode.window.showQuickPick(
      order.map((name, index) => ({
        label: `${index + 1}. ${name}`,
        description: describe(declared.get(name)),
        ref: declared.get(name),
      })),
      {
        title: `Execution order — ${study.id}`,
        placeHolder: "Select a dataset to open its declaration",
      },
    );
    if (chosen?.ref) await openSpec(chosen.ref);
  });

  register("fleet.defineXml", async (arg) => {
    const study = await pickStudy(arg);
    if (!study) return;
    const standard =
      arg instanceof Item && arg.standard ? arg.standard : await pickStandard(study, arg);
    if (!standard) return;
    const code = await runFleet(study.root, "define-xml", ["--standard", standard.id]);
    if (code === 0)
      await offerReport(
        study,
        path.join(study.paths.define_xml ?? "", `define_${standard.id}_preview.html`),
        `Define-XML generated for ${label(standard)}.`,
      );
  });

  register("fleet.openProgram", async (arg) => {
    const picked = await pickDataset(arg);
    if (!picked?.ref) return;
    const { study, ref } = picked;
    const program = programOf(ref);
    if (!program) throw new Error(`study_config.yaml has no programs_${ref.standard.id} folder.`);
    if (!(await stat(program))) {
      const choice = await vscode.window.showInformationMessage(
        `No program at ${relative(study.root, program)} yet.`,
        "Generate from Spec",
        "Create Empty",
      );
      if (choice === "Generate from Spec") return generateProgram(ref);
      if (!choice) return;
      await vscode.workspace.fs.writeFile(program, new TextEncoder().encode(skeleton(ref)));
    }
    await vscode.window.showTextDocument(program);
  });

  register("fleet.programFromSpec", async (arg) => {
    const picked = await pickDataset(arg);
    if (picked?.ref) await generateProgram(picked.ref);
  });

  register("fleet.pushToSpec", async (arg) => {
    const editor = vscode.window.activeTextEditor;
    const document =
      arg instanceof vscode.Uri ? await vscode.workspace.openTextDocument(arg) : editor?.document;
    if (document?.languageId !== "python")
      throw new Error("Open the Python program whose derivations should go to the spec.");
    const selected = editor?.document === document && !editor.selection.isEmpty;
    const source = selected ? document.getText(editor.selection) : document.getText();
    const study = await pickStudy(document.uri);
    if (!study) return;
    const refs = await datasetsOf(study);
    const own = path.basename(document.fileName, ".py").toUpperCase();
    const ref =
      refs.find((entry) => entry.dataset.name === own) ??
      (await chooseDataset(refs, `Which dataset does ${path.basename(document.fileName)} build?`));
    if (!ref) return;

    const rows = calls(
      await ask(
        study,
        "fleet_code_to_spec",
        { source },
        `Fleet: reading derivations from ${path.basename(document.fileName)}`,
      ),
    ).filter((row) => row.standard === ref.standard.id);
    // Last derivation of a target wins, as in Fleet's own lineage.
    const latest = [...new Map(rows.map((row) => [row.name, row])).values()];
    const usable = latest.flatMap((row): DerivationRow[] =>
      row.status === "ok" && row.block
        ? [{ name: row.name, block: row.block, label: row.meta.label }]
        : [],
    );
    const left = latest.filter((row) => row.status !== "ok");
    for (const row of left)
      output.appendLine(
        `${ref.dataset.name}.${row.name} stays inline: ${row.verb}() on line ${row.line}, ${row.reason}.`,
      );
    if (!usable.length)
      throw new Error(
        `No spec-expressible ${label(ref.standard)} derivation in ${path.basename(document.fileName)}` +
          (left.length ? ` (${left.length} call(s) stay inline; see the log).` : "."),
      );

    const spec = await vscode.workspace.openTextDocument(ref.standard.spec);
    const text = spec.getText();
    const dataset = parseSpec(text).find((entry) => entry.name === ref.dataset.name);
    if (!dataset) throw new Error(`${ref.dataset.name} is no longer declared in the spec.`);
    const result = derivationEdits(text, dataset, usable);
    const edit = new vscode.WorkspaceEdit();
    for (const change of result.edits)
      edit.replace(
        ref.standard.spec,
        new vscode.Range(spec.positionAt(change.start), spec.positionAt(change.end)),
        change.text,
      );
    await vscode.workspace.applyEdit(edit);
    await openSpec(ref);
    const summary = [
      `${ref.dataset.name}: ${usable.length} derivation(s) written to ${relative(study.root, ref.standard.spec)}`,
      result.updated.length ? `${result.updated.length} replaced` : "",
      result.appended.length ? `${result.appended.length} appended as undeclared variables` : "",
      left.length ? `${left.length} stay inline: ${left.map((row) => row.name).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (await vscode.window.showInformationMessage(`${summary}.`, ...(left.length ? ["Why?"] : [])))
      output.show();
  });

  register("fleet.preview", async (arg) => {
    const uri =
      arg instanceof vscode.Uri
        ? arg
        : arg instanceof Item
          ? arg.resourceUri
          : (
              await vscode.window.showOpenDialog({
                title: "Report to preview",
                canSelectMany: false,
                filters: { Reports: ["html", "htm"] },
              })
            )?.[0];
    if (uri) await preview(uri);
  });

  register("fleet.openExternal", async (arg) => {
    const uri = arg instanceof Item ? arg.resourceUri : arg instanceof vscode.Uri ? arg : undefined;
    if (uri) await vscode.env.openExternal(uri);
  });
}

// ── choosing what to act on ──────────────────────────────────────────────

function isRef(value: unknown): value is DatasetRef {
  return !!value && typeof value === "object" && "study" in value && "dataset" in value;
}

async function pickStudy(arg?: unknown): Promise<Study | undefined> {
  if (arg instanceof Item && (arg.study ?? arg.ref)) return arg.study ?? arg.ref?.study;
  if (isRef(arg)) return arg.study;
  const studies = await findStudies();
  if (!studies.length) {
    const choice = await vscode.window.showInformationMessage(
      "No study_config.yaml in this workspace.",
      "New Study",
    );
    if (choice) await vscode.commands.executeCommand("fleet.newStudy");
    return;
  }
  if (studies.length === 1) return studies[0];
  const anchor = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
  const containing = anchor
    ? studies.filter((study) => !relative(study.root, anchor).startsWith(".."))
    : [];
  if (containing.length === 1) return containing[0];
  return (
    await vscode.window.showQuickPick(
      studies.map((study) => ({
        label: study.id,
        description: vscode.workspace.asRelativePath(study.root),
        study,
      })),
      { title: "Fleet study" },
    )
  )?.study;
}

async function pickDataset(arg: unknown, allowAll = false): Promise<Picked | undefined> {
  if (arg instanceof Item && arg.ref) return { study: arg.ref.study, ref: arg.ref };
  if (isRef(arg)) return { study: arg.study, ref: arg };
  const study = await pickStudy(arg);
  if (!study) return;
  if (allowAll && arg instanceof Item && arg.study) return { study };
  let refs = await datasetsOf(study);
  // From an editor title button, offer only that spec's datasets.
  if (arg instanceof vscode.Uri)
    refs = refs.filter((ref) => ref.standard.spec.fsPath === arg.fsPath);
  if (!refs.length) throw new Error("No datasets are declared in this study's define.yaml files.");
  const chosen = await chooseDataset(refs, allowAll ? "Fleet: run" : "Fleet dataset", allowAll);
  return chosen === undefined ? undefined : { study, ref: chosen ?? undefined };
}

/** Pick one dataset; `null` means "all of them" when offered, `undefined` a cancel. */
async function chooseDataset(
  refs: DatasetRef[],
  title: string,
  allowAll = false,
): Promise<DatasetRef | null | undefined> {
  const items = refs.map((ref) => ({
    label: ref.dataset.name,
    description: describe(ref),
    ref,
  }));
  const all = { label: "$(run-all) All datasets", description: "in spec order", ref: null };
  const chosen = await vscode.window.showQuickPick(allowAll ? [all, ...items] : items, {
    title,
    matchOnDescription: true,
  });
  return chosen?.ref;
}

async function pickStandard(study: Study, arg?: unknown): Promise<Standard | undefined> {
  const standards = standardsOf(study);
  const fromEditor =
    arg instanceof vscode.Uri && standards.find((standard) => standard.spec.fsPath === arg.fsPath);
  if (fromEditor) return fromEditor;
  if (standards.length === 1) return standards[0];
  return (
    await vscode.window.showQuickPick(
      standards.map((standard) => ({ label: label(standard), standard })),
      { title: "Define-XML standard" },
    )
  )?.standard;
}

function describe(ref: DatasetRef | undefined): string {
  return ref ? [label(ref.standard), ref.dataset.label].filter(Boolean).join(" · ") : "raw input";
}

function label(standard: Standard): string {
  return STANDARD_LABELS[standard.id] ?? standard.id.toUpperCase();
}

async function builtOutput(ref: DatasetRef): Promise<vscode.Uri> {
  const output = await outputOf(ref);
  if (!output) throw new Error(`${ref.dataset.name} has no output yet. Run it first.`);
  return output.uri;
}

async function specPaths(study: Study): Promise<string[]> {
  const paths: string[] = [];
  for (const standard of standardsOf(study))
    if (await stat(standard.spec)) paths.push(standard.spec.fsPath);
  if (!paths.length) throw new Error("This study has no define.yaml to analyse.");
  return paths;
}

async function openSpec(ref: DatasetRef): Promise<void> {
  const line = ref.dataset.line;
  await vscode.window.showTextDocument(ref.standard.spec, {
    selection: new vscode.Range(line, 0, line, 0),
  });
}

// ── asking Fleet ─────────────────────────────────────────────────────────

/** The program Fleet renders from the spec: written when none exists, shown beside it otherwise. */
async function generateProgram(ref: DatasetRef): Promise<void> {
  const code = await ask(
    ref.study,
    "fleet_spec_to_code",
    { define_yaml: ref.standard.spec.fsPath, dataset: ref.dataset.name },
    `Fleet: rendering ${ref.dataset.name} from its spec`,
  );
  if (typeof code !== "string") throw new Error("Fleet returned no program text.");
  const program = programOf(ref);
  if (program && !(await stat(program))) {
    await vscode.workspace.fs.writeFile(program, new TextEncoder().encode(code));
    await vscode.window.showTextDocument(program);
    return;
  }
  const document = await vscode.workspace.openTextDocument({ language: "python", content: code });
  await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside });
}

function calls(value: unknown): ConvertedCall[] {
  if (!Array.isArray(value) || !value.every(isCall))
    throw new Error("Fleet returned an unexpected result shape.");
  return value;
}

function isCall(value: unknown): value is ConvertedCall {
  return (
    !!value &&
    typeof value === "object" &&
    "name" in value &&
    "status" in value &&
    "standard" in value &&
    "block" in value &&
    "meta" in value
  );
}

function ask(
  study: Study,
  tool: string,
  args: Record<string, unknown>,
  title: string,
): Thenable<unknown> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    (_progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      return callTool(
        fleetCommand(study.root, ["mcp", "--stdio"]),
        study.root.fsPath,
        tool,
        args,
        controller.signal,
      );
    },
  );
}

function mcpDefinition(study: Study): vscode.McpStdioServerDefinition {
  const command = fleetCommand(study.root, ["mcp", "--stdio"]);
  const definition = new vscode.McpStdioServerDefinition(
    `Fleet (${study.id})`,
    command.command,
    command.args,
  );
  definition.cwd = study.root;
  return definition;
}

/** Fleet's conformance findings placed on the spec lines they concern. */
function conformance(ref: DatasetRef, result: DatasetCheck, file: string): vscode.Diagnostic[] {
  const { Warning, Information, Error } = vscode.DiagnosticSeverity;
  const at = (line: number, message: string, severity: vscode.DiagnosticSeverity) => {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line, 0, line, 200),
      message,
      severity,
    );
    diagnostic.source = "fleet";
    return diagnostic;
  };
  const lineOf = (name: string) =>
    ref.dataset.variables.find((variable) => variable.name === name)?.line ?? ref.dataset.line;
  const head = ref.dataset.line;
  return [
    ...(result.missing_columns ?? []).map((name) =>
      at(lineOf(name), `${name} is declared but absent from ${file}.`, Warning),
    ),
    ...(result.type_mismatches ?? []).map((mismatch) =>
      at(
        lineOf(mismatch.variable),
        `${mismatch.variable}: spec type ${mismatch.define_type}, data has ${mismatch.actual_dtype}.`,
        Warning,
      ),
    ),
    ...(result.extra_columns?.length
      ? [
          at(
            head,
            `Columns in ${file} not declared here: ${result.extra_columns.join(", ")}.`,
            Information,
          ),
        ]
      : []),
    ...(result.errors ?? []).map((message) => at(head, message, Error)),
    ...(result.warnings ?? []).map((message) => at(head, message, Warning)),
    ...(result.info ?? []).map((message) => at(head, message, Information)),
  ];
}

// ── showing results ──────────────────────────────────────────────────────

/** `outputs/<name>`, relative to the study, with the folder in place for Fleet to write into. */
async function reportPath(study: Study, name: string): Promise<string> {
  const folder = vscode.Uri.joinPath(study.root, study.paths.outputs ?? "outputs");
  await vscode.workspace.fs.createDirectory(folder);
  return relative(study.root, vscode.Uri.joinPath(folder, name));
}

async function offerReport(
  study: Study,
  reportRelative: string,
  message: string,
  warn = false,
): Promise<void> {
  const report = vscode.Uri.joinPath(study.root, reportRelative);
  const actions = (await stat(report)) ? ["Open Report"] : [];
  const show = warn ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  if (await show(message, ...actions)) await preview(report);
}

/** A script-free rendering of a Fleet HTML report beside the editor. */
async function preview(uri: vscode.Uri): Promise<void> {
  const html = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  const panel = vscode.window.createWebviewPanel(
    "fleet.preview",
    path.basename(uri.fsPath),
    vscode.ViewColumn.Beside,
    { enableScripts: false, localResourceRoots: [] },
  );
  // Fleet's reports are static HTML with inline styles; nothing else may load.
  const csp =
    `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;
  panel.webview.html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (match) => match + csp)
    : csp + html;
}

async function newStudy(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    await vscode.commands.executeCommand("vscode.openFolder");
    return;
  }
  const id = await vscode.window.showInputBox({
    title: "New Fleet study",
    prompt: "Study identifier",
    placeHolder: "STUDY01",
    validateInput: (value) => (value.trim() ? undefined : "A study identifier is required."),
  });
  if (!id) return;
  const command = fleetCommand(folder.uri, [
    "new",
    id.trim(),
    "--domains",
    "DM,AE,VS,EX",
    "--adam-datasets",
    "ADSL",
  ]);
  const terminal = vscode.window.createTerminal({ name: "Fleet", cwd: folder.uri });
  terminal.show();
  // Typed, not run: `fleet new` asks its own confirmation and the flags are the user's to adjust.
  terminal.sendText([command.command, ...command.args].map(quote).join(" "), false);
}

function quote(argument: string): string {
  return /[\s"']/.test(argument) ? JSON.stringify(argument) : argument;
}

function skeleton(ref: DatasetRef): string {
  const spec = relative(ref.study.root, ref.standard.spec);
  return [
    "# %%",
    `# ${ref.dataset.name}${ref.dataset.label ? ` — ${ref.dataset.label}` : ""}. Spec: ${spec}`,
    "import fleet",
    "import polars as pl",
    "",
    "# %%",
    "",
  ].join("\n");
}
