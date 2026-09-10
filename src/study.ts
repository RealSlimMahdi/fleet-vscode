// The study as VS Code sees it: where its files are and which `fleet` runs
// it. Structure and positions come from spec.ts; nothing clinical lives here.

import * as path from "node:path";

import * as vscode from "vscode";

import type { ServerCommand } from "./server.ts";
import { discoverFleetCommand } from "./server.ts";
import type { SpecDataset } from "./spec.ts";
import { parseSpec, parseStudy, standards } from "./spec.ts";

export const EXCLUDE = "**/{.git,.venv,node_modules,.vscode-test,__pycache__}/**";

export interface Study {
  id: string;
  root: vscode.Uri;
  config: vscode.Uri;
  paths: Record<string, string>;
  /** Set when study_config.yaml could not be parsed; `paths` are then Fleet's defaults. */
  error?: string;
}

export interface Standard {
  /** `sdtm`, `adam`, … — from the `metadata_<id>` key in `paths:`. */
  id: string;
  spec: vscode.Uri;
  data?: vscode.Uri;
  programs?: vscode.Uri;
}

/** One declared dataset, with everything needed to act on it. */
export interface DatasetRef {
  study: Study;
  standard: Standard;
  dataset: SpecDataset;
}

export const STANDARD_LABELS: Record<string, string> = { sdtm: "SDTM", adam: "ADaM", send: "SEND" };

export async function findStudies(): Promise<Study[]> {
  const configs = await vscode.workspace.findFiles("**/study_config.yaml", EXCLUDE);
  const studies = await Promise.all(
    configs.map(async (config): Promise<Study> => {
      const root = vscode.Uri.joinPath(config, "..");
      try {
        return { ...parseStudy(await text(config)), root, config };
      } catch (error) {
        const { paths } = parseStudy("");
        return { id: path.basename(root.fsPath), root, config, paths, error: String(error) };
      }
    }),
  );
  return studies.sort((left, right) => left.root.fsPath.localeCompare(right.root.fsPath));
}

export function standardsOf(study: Study): Standard[] {
  const at = (relative: string | undefined) =>
    relative === undefined ? undefined : vscode.Uri.joinPath(study.root, relative);
  return standards(study).map((standard) => ({
    id: standard.id,
    // Exactly the file `fleet run` reads, not every define*.yaml the LSP serves.
    spec: vscode.Uri.joinPath(study.root, standard.metadata, "define.yaml"),
    data: at(standard.data),
    programs: at(standard.programs),
  }));
}

const specs = new Map<string, { document: vscode.TextDocument; datasets: SpecDataset[] }>();

/** Parse a spec, reading unsaved edits when the file is open. Throws when missing or malformed. */
export async function loadSpec(uri: vscode.Uri): Promise<SpecDataset[]> {
  const document = await vscode.workspace.openTextDocument(uri);
  const cached = specs.get(uri.toString());
  // Identity, not just version: a document reopened after an on-disk change restarts at 1.
  if (cached?.document === document && cached.document.version === document.version)
    return cached.datasets;
  const datasets = parseSpec(document.getText());
  specs.set(uri.toString(), { document, datasets });
  return datasets;
}

/** Every dataset declared across the study's readable specs. */
export async function datasetsOf(study: Study): Promise<DatasetRef[]> {
  const refs: DatasetRef[] = [];
  for (const standard of standardsOf(study)) {
    try {
      for (const dataset of await loadSpec(standard.spec)) refs.push({ study, standard, dataset });
    } catch {
      // A missing or broken spec is reported where it is opened, not here.
    }
  }
  return refs;
}

/** The dataset's written output, in the formats `fleet run` can produce. */
export async function outputOf(
  ref: DatasetRef,
): Promise<{ uri: vscode.Uri; mtime: number } | undefined> {
  if (!ref.standard.data) return undefined;
  for (const extension of ["parquet", "xpt", "json"]) {
    const uri = vscode.Uri.joinPath(
      ref.standard.data,
      `${ref.dataset.name.toLowerCase()}.${extension}`,
    );
    const found = await stat(uri);
    if (found) return { uri, mtime: found.mtime };
  }
  return undefined;
}

/** Where the dataset's program lives by convention (`programs/sdtm/dm.py`); may not exist yet. */
export function programOf(ref: DatasetRef): vscode.Uri | undefined {
  return (
    ref.standard.programs &&
    vscode.Uri.joinPath(ref.standard.programs, `${ref.dataset.name.toLowerCase()}.py`)
  );
}

export async function stat(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch {
    return undefined;
  }
}

/** The `fleet` that serves this study, with *args* — the same one the language server uses. */
export function fleetCommand(root: vscode.Uri, args: string[]): ServerCommand {
  return discoverFleetCommand(args, {
    workspaceRoot: root.fsPath,
    configuredPath: vscode.workspace.getConfiguration("fleet", root).get<string>("server.path"),
  });
}

export function relative(root: vscode.Uri, uri: vscode.Uri): string {
  return path.relative(root.fsPath, uri.fsPath) || ".";
}

async function text(uri: vscode.Uri): Promise<string> {
  return (await vscode.workspace.openTextDocument(uri)).getText();
}
