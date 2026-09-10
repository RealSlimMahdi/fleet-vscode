// The Fleet Study view: study → standard (define.yaml) → dataset → variable,
// plus the reports Fleet has written. Every row opens its source line.

import * as path from "node:path";

import * as vscode from "vscode";

import { age } from "./spec.ts";
import type { DatasetRef, Standard, Study } from "./study.ts";
import {
  EXCLUDE,
  loadSpec,
  outputOf,
  programOf,
  relative,
  findStudies,
  standardsOf,
  stat,
  STANDARD_LABELS,
} from "./study.ts";

const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;

export class Item extends vscode.TreeItem {
  study?: Study;
  standard?: Standard;
  ref?: DatasetRef;
  children?: () => Promise<Item[]>;

  constructor(label: string, icon: string, state = None) {
    super(label, state);
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

function open(uri: vscode.Uri, line = 0): vscode.Command {
  const selection = new vscode.Range(line, 0, line, 0);
  return { command: "vscode.open", title: "Open", arguments: [uri, { selection }] };
}

function note(text: string): Item {
  return new Item(text, "info");
}

export class StudyTree implements vscode.TreeDataProvider<Item>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{yaml,py,parquet,xpt,json,html,xml}",
  );
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 400);
    };
    this.watcher.onDidCreate(schedule);
    this.watcher.onDidChange(schedule);
    this.watcher.onDidDelete(schedule);
  }

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(item: Item): Item {
    return item;
  }

  async getChildren(item?: Item): Promise<Item[]> {
    if (item) return item.children ? item.children() : [];
    return (await findStudies()).map((study) => this.studyItem(study));
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.watcher.dispose();
    this.changed.dispose();
  }

  private studyItem(study: Study): Item {
    const item = new Item(study.id, "beaker", Expanded);
    item.study = study;
    item.contextValue = "study";
    item.command = open(study.config);
    const folder = vscode.workspace.getWorkspaceFolder(study.root);
    const inside = folder ? relative(folder.uri, study.root) : undefined;
    item.description = inside === "." ? undefined : inside;
    item.tooltip = study.error ?? study.config.fsPath;
    item.children = () =>
      Promise.resolve([
        ...(study.error ? [note(`study_config.yaml: ${study.error}`)] : []),
        ...standardsOf(study).map((standard) => this.standardItem(study, standard)),
        this.reportsItem(study),
      ]);
    return item;
  }

  private standardItem(study: Study, standard: Standard): Item {
    const item = new Item(
      STANDARD_LABELS[standard.id] ?? standard.id.toUpperCase(),
      "book",
      Expanded,
    );
    item.study = study;
    item.standard = standard;
    item.contextValue = "spec";
    item.description = relative(study.root, standard.spec);
    item.command = open(standard.spec);
    item.children = async () => {
      let datasets;
      try {
        datasets = await loadSpec(standard.spec);
      } catch (error) {
        return [note(error instanceof Error ? error.message : String(error))];
      }
      if (!datasets.length) return [note("No datasets declared")];
      return Promise.all(datasets.map((dataset) => this.datasetItem({ study, standard, dataset })));
    };
    return item;
  }

  private async datasetItem(ref: DatasetRef): Promise<Item> {
    const { study, standard, dataset } = ref;
    const item = new Item(dataset.name, "circle-large-outline", Collapsed);
    item.ref = ref;
    item.contextValue = "dataset";
    item.command = open(standard.spec, dataset.line);

    const [output, spec, program] = await Promise.all([
      outputOf(ref),
      stat(standard.spec),
      (async () => {
        const uri = programOf(ref);
        return uri && { uri, stat: await stat(uri) };
      })(),
    ]);
    const lines = [
      `**${dataset.name}**${dataset.label ? ` — ${dataset.label}` : ""}`,
      `Keys: ${dataset.keys.join(", ") || "none declared"}`,
    ];
    if (output) {
      // mtimes are a hint that a rebuild is due, never proof that one is not.
      const stale = output.mtime < Math.max(spec?.mtime ?? 0, program?.stat?.mtime ?? 0);
      item.iconPath = stale
        ? new vscode.ThemeIcon("database", new vscode.ThemeColor("list.warningForeground"))
        : new vscode.ThemeIcon("database");
      item.description = `${path.basename(output.uri.fsPath)} · ${age(output.mtime)}${stale ? " · older than spec or program" : ""}`;
      lines.push(`Output: ${relative(study.root, output.uri)} (${age(output.mtime)})`);
    } else {
      item.description = "not built";
      lines.push("Output: not built");
    }
    lines.push(
      program
        ? `Program: ${relative(study.root, program.uri)}${program.stat ? "" : " (not created yet)"}`
        : `Program folder: no programs_${standard.id} in study_config.yaml`,
    );
    item.tooltip = new vscode.MarkdownString(lines.join("  \n"));
    item.children = () =>
      Promise.resolve(
        dataset.variables.map((variable) => {
          const leaf = new Item(variable.name, "symbol-field");
          leaf.description = variable.label;
          leaf.command = open(standard.spec, variable.line);
          leaf.tooltip = new vscode.MarkdownString().appendCodeblock(variable.stanza, "yaml");
          return leaf;
        }),
      );
    return item;
  }

  private reportsItem(study: Study): Item {
    const item = new Item("Reports", "graph", Collapsed);
    item.children = async () => {
      const folders = new Set([study.paths.outputs, study.paths.define_xml].filter(Boolean));
      const found = new Map<string, vscode.Uri>();
      for (const folder of folders) {
        const pattern = new vscode.RelativePattern(
          vscode.Uri.joinPath(study.root, folder),
          "**/*.{html,htm,xml,pdf,rtf,pptx}",
        );
        for (const uri of await vscode.workspace.findFiles(pattern, EXCLUDE))
          found.set(uri.fsPath, uri);
      }
      const reports = await Promise.all(
        [...found.values()].map(async (uri) => ({ uri, mtime: (await stat(uri))?.mtime ?? 0 })),
      );
      if (!reports.length) return [note("No reports yet")];
      return reports
        .sort((left, right) => right.mtime - left.mtime)
        .map(({ uri, mtime }) => {
          const leaf = new Item(path.basename(uri.fsPath), "file");
          leaf.iconPath = vscode.ThemeIcon.File;
          leaf.resourceUri = uri;
          leaf.contextValue = "report";
          leaf.description = `${relative(study.root, vscode.Uri.joinPath(uri, ".."))} · ${age(mtime)}`;
          leaf.command = /\.html?$/i.test(uri.path)
            ? { command: "fleet.preview", title: "Preview", arguments: [uri] }
            : open(uri);
          return leaf;
        });
    };
    return item;
  }
}
