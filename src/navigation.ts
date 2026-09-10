// Spec ↔ code navigation. In a Python program, a quoted CDISC variable name
// hovers and jumps to its define.yaml declaration; in define.yaml, every
// dataset gets run / compare / program lenses.

import * as path from "node:path";

import * as vscode from "vscode";

import type { SpecVariable } from "./spec.ts";
import type { DatasetRef } from "./study.ts";
import { datasetsOf, findStudies } from "./study.ts";

/** A quoted CDISC variable name: up to eight characters, as the spec schema requires. */
const QUOTED_VARIABLE = /["'][A-Z_][A-Z0-9_]{0,7}["']/;

export interface VariableMatch {
  ref: DatasetRef;
  variable: SpecVariable;
}

/** Declarations of *name* across every study, the dataset named like the program first. */
export async function findVariable(name: string, preferred?: string): Promise<VariableMatch[]> {
  const matches: VariableMatch[] = [];
  for (const study of await findStudies())
    for (const ref of await datasetsOf(study)) {
      const variable = ref.dataset.variables.find((entry) => entry.name === name);
      if (variable) matches.push({ ref, variable });
    }
  const rank = (match: VariableMatch) => Number(match.ref.dataset.name === preferred);
  return matches.sort((left, right) => rank(right) - rank(left));
}

export function registerNavigation(context: vscode.ExtensionContext): void {
  const python = { language: "python" };
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(python, {
      async provideHover(document, position) {
        const hit = variableAt(document, position);
        if (!hit) return;
        const matches = await findVariable(hit.name, datasetOf(document));
        if (!matches.length) return;
        const markdown = new vscode.MarkdownString();
        for (const { ref, variable } of matches.slice(0, 3)) {
          const target = ref.standard.spec.with({ fragment: `L${variable.line + 1}` });
          markdown.appendMarkdown(
            `**${ref.dataset.name}.${variable.name}** — [${vscode.workspace.asRelativePath(ref.standard.spec)}](${target.toString()})\n`,
          );
          markdown.appendCodeblock(variable.stanza, "yaml");
        }
        if (matches.length > 3)
          markdown.appendMarkdown(`…declared in ${matches.length - 3} more dataset(s)`);
        return new vscode.Hover(markdown, hit.range);
      },
    }),
    vscode.languages.registerDefinitionProvider(python, {
      async provideDefinition(document, position) {
        const hit = variableAt(document, position);
        if (!hit) return;
        return (await findVariable(hit.name, datasetOf(document))).map(
          ({ ref, variable }) =>
            new vscode.Location(ref.standard.spec, new vscode.Position(variable.line, 0)),
        );
      },
    }),
    vscode.languages.registerCodeLensProvider(
      { language: "yaml", pattern: "**/define*.yaml" },
      {
        async provideCodeLenses(document) {
          const lenses: vscode.CodeLens[] = [];
          for (const study of await findStudies())
            for (const ref of await datasetsOf(study)) {
              if (ref.standard.spec.fsPath !== document.uri.fsPath) continue;
              const range = new vscode.Range(ref.dataset.line, 0, ref.dataset.line, 0);
              lenses.push(
                new vscode.CodeLens(range, {
                  command: "fleet.run",
                  title: "$(play) Run",
                  arguments: [ref],
                }),
                new vscode.CodeLens(range, {
                  command: "fleet.compare",
                  title: "$(diff) Compare with QC",
                  arguments: [ref],
                }),
                new vscode.CodeLens(range, {
                  command: "fleet.openProgram",
                  title: "$(go-to-file) Program",
                  arguments: [ref],
                }),
              );
            }
          return lenses;
        },
      },
    ),
  );
}

function variableAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { name: string; range: vscode.Range } | undefined {
  const range = document.getWordRangeAtPosition(position, QUOTED_VARIABLE);
  return range && { name: document.getText(range).slice(1, -1), range };
}

/** `programs/sdtm/dm.py` is DM's program by convention; its own dataset ranks first. */
function datasetOf(document: vscode.TextDocument): string {
  return path.basename(document.fileName, ".py").toUpperCase();
}
