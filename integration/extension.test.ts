// Extension Host coverage: the packaged extension activates in a real VS Code
// for the fixture study. No Python runs here — the language server is allowed
// to fail, and every workbench surface must still come up.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import * as vscode from "vscode";

const EXTENSION_ID = "fleet-vscode.fleet-vscode";
const RESTART_COMMAND = "fleet.restartServer";

interface Manifest {
  contributes: {
    commands: { command: string }[];
    views: Record<string, { id: string }[]>;
    taskDefinitions: { type: string }[];
    mcpServerDefinitionProviders: { id: string }[];
  };
  capabilities: { untrustedWorkspaces: { supported: boolean } };
}

async function waitFor(condition: () => boolean, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

async function activated(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not installed in the Extension Host`);
  await extension.activate();
  return extension;
}

async function single(pattern: string): Promise<vscode.Uri> {
  const [uri, ...rest] = await vscode.workspace.findFiles(pattern);
  assert.ok(uri, `the fixture workspace has no ${pattern}`);
  assert.equal(rest.length, 0, `the fixture workspace has several ${pattern}`);
  return uri;
}

function positionOf(document: vscode.TextDocument, needle: string): vscode.Position {
  const offset = document.getText().indexOf(needle);
  assert.notEqual(offset, -1, `${needle} is not in ${document.fileName}`);
  return document.positionAt(offset + 1);
}

suite("Fleet CDISC activation", () => {
  test("activates itself for a workspace containing define.yaml", async () => {
    const specs = await vscode.workspace.findFiles("**/define.yaml");
    assert.ok(specs.length > 0, "the fixture workspace has no define.yaml to activate on");

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed in the Extension Host`);

    // Not `activate()`: forcing it would prove nothing about the manifest.
    assert.ok(await waitFor(() => extension.isActive), "extension never activated on its own");
  });

  test("registers the restart command", async () => {
    await activated();

    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes(RESTART_COMMAND), `${RESTART_COMMAND} is not registered`);
  });
});

suite("Fleet study workbench", () => {
  test("registers every contributed command even when the LSP cannot start", async () => {
    const extension = await activated();
    const manifest = extension.packageJSON as Manifest;
    const commands = await vscode.commands.getCommands(true);

    for (const entry of manifest.contributes.commands)
      assert.ok(commands.includes(entry.command), `${entry.command} is not registered`);
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
    assert.ok(manifest.contributes.views.fleet.some((view) => view.id === "fleet.study"));
    assert.deepEqual(
      manifest.contributes.taskDefinitions.map((definition) => definition.type),
      ["fleet"],
    );
    assert.deepEqual(
      manifest.contributes.mcpServerDefinitionProviders.map((provider) => provider.id),
      ["fleet.mcp"],
    );
  });

  test("shows the study view and refreshes it", async () => {
    await activated();
    await vscode.commands.executeCommand("fleet.study.focus");
    await vscode.commands.executeCommand("fleet.refresh");
  });

  test("offers the study's Fleet commands as tasks", async () => {
    await activated();

    const tasks = await vscode.tasks.fetchTasks({ type: "fleet" });
    const names = tasks.map((task) => task.name);

    for (const expected of ["check", "doctor", "run", "validate", "define-xml --standard sdtm"])
      assert.ok(names.includes(expected), `no "${expected}" task among: ${names.join(", ")}`);
  });

  test("hovers a quoted variable in a program with its spec declaration", async () => {
    await activated();
    const program = await vscode.workspace.openTextDocument(await single("**/programs/sdtm/*.py"));
    const position = positionOf(program, '"USUBJID"');

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      program.uri,
      position,
    );

    const text = hovers
      .flatMap((hover) => hover.contents)
      .map((content) => (typeof content === "string" ? content : content.value))
      .join("\n");
    assert.match(text, /EX\.USUBJID/);
    assert.match(text, /label: Unique Subject Identifier/);
  });

  test("jumps from a quoted variable to its declaration", async () => {
    await activated();
    const program = await vscode.workspace.openTextDocument(await single("**/programs/sdtm/*.py"));
    const spec = await single("**/define.yaml");

    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider",
      program.uri,
      positionOf(program, '"USUBJID"'),
    );

    assert.equal(locations.length, 1);
    assert.equal(locations[0].uri.toString(), spec.toString());
    const declared = await vscode.workspace.openTextDocument(spec);
    assert.match(declared.lineAt(locations[0].range.start.line).text, /name: USUBJID/);
  });

  test("lenses every dataset in define.yaml with run, compare and program actions", async () => {
    await activated();
    const spec = await single("**/define.yaml");

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      spec,
    );

    const titles = lenses.map((lens) => lens.command?.title);
    assert.ok(titles.includes("$(play) Run"), titles.join(", "));
    assert.ok(titles.includes("$(diff) Compare with QC"), titles.join(", "));
    assert.ok(titles.includes("$(go-to-file) Program"), titles.join(", "));
    const declared = await vscode.workspace.openTextDocument(spec);
    assert.match(declared.lineAt(lenses[0].range.start.line).text, /name: EX/);
  });

  test("previews a report beside the editor without running its scripts", async () => {
    await activated();
    const directory = await mkdtemp(path.join(tmpdir(), "fleet-report-"));
    try {
      const report = path.join(directory, "summary.html");
      await writeFile(
        report,
        "<html><head><title>t</title></head><body><table><tr><th>N</th><td>42</td></tr></table>" +
          "<script>throw new Error('must not execute')</script></body></html>",
      );
      await vscode.commands.executeCommand("fleet.preview", vscode.Uri.file(report));
      assert.ok(
        await waitFor(() =>
          vscode.window.tabGroups.all.some((group) =>
            group.tabs.some(
              (tab) => tab.input instanceof vscode.TabInputWebview && tab.label === "summary.html",
            ),
          ),
        ),
        "no webview tab opened for the report",
      );
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
