// Reading a study's own files: study_config.yaml and define.yaml.
//
// Only structure and source positions are read here — no clinical meaning.
// Never import `vscode`: this runs under `node --test`.

import { isMap, isNode, isScalar, isSeq, LineCounter, parseDocument, stringify } from "yaml";
import type { YAMLMap } from "yaml";

export interface StudyConfig {
  id: string;
  /** Configured folders keyed as in `paths:` (`metadata_sdtm`, `sdtm_data`, …). */
  paths: Record<string, string>;
}

export interface SpecVariable {
  name: string;
  label?: string;
  /** Zero-based line of `name:` in the spec file. */
  line: number;
  /** The variable's YAML block as written, dedented — shown verbatim on hover. */
  stanza: string;
  /** Character offsets [start, end) of the variable's YAML map. */
  range: [number, number];
  /** Column of the variable's keys. */
  indent: number;
  /** Offsets [start, end) of its `derivation:` entry, when declared. */
  derivation?: [number, number];
}

export interface SpecDataset {
  name: string;
  label?: string;
  keys: string[];
  line: number;
  variables: SpecVariable[];
}

/** Fleet's own defaults (`StudyPaths` in fleet/core/study_context.py), for configs that omit a key. */
const DEFAULT_PATHS: Record<string, string> = {
  raw_data: "data/raw",
  sdtm_data: "data/sdtm",
  adam_data: "data/adam",
  metadata_sdtm: "metadata/sdtm",
  metadata_adam: "metadata/adam",
  define_xml: "metadata",
  outputs: "outputs",
  programs_sdtm: "programs/sdtm",
  programs_adam: "programs/adam",
  programs_tlg: "programs/tlg",
};

export function parseStudy(text: string): StudyConfig {
  const document = parseDocument(text);
  if (document.errors.length) throw new Error(document.errors[0].message);
  const data: unknown = document.toJS();
  const root = isRecord(data) ? data : {};
  const paths = isRecord(root.paths) ? root.paths : {};
  return {
    id: typeof root.study_id === "string" ? root.study_id : "study",
    paths: {
      ...DEFAULT_PATHS,
      ...Object.fromEntries(
        Object.entries(paths).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    },
  };
}

export function parseSpec(text: string): SpecDataset[] {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const datasets = document.get("datasets", true);
  if (!isSeq(datasets)) return [];
  return datasets.items.flatMap((dataset) => {
    if (!isMap(dataset)) return [];
    const name = named(dataset);
    if (!name) return [];
    const variables = dataset.get("variables", true);
    return [
      {
        name,
        label: label(dataset),
        keys: strings(dataset.get("keys")),
        line: lineOf(lines, dataset),
        variables: isSeq(variables)
          ? variables.items.flatMap((variable) => {
              const variableName = isMap(variable) ? named(variable) : undefined;
              if (!isMap(variable) || !variableName) return [];
              const [start, end] = variable.range ?? [0, 0];
              return [
                {
                  name: variableName,
                  label: label(variable),
                  line: lineOf(lines, variable),
                  stanza: stanza(text, lines, variable),
                  range: [start, end],
                  indent: lines.linePos(start).col - 1,
                  derivation: pairRange(variable, "derivation"),
                },
              ];
            })
          : [],
      },
    ];
  });
}

/** A derivation block Fleet produced for one variable. */
export interface DerivationRow {
  name: string;
  block: Record<string, unknown>;
  label?: string;
}

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export interface DerivationEdits {
  edits: TextEdit[];
  /** Variables whose existing `derivation:` was replaced. */
  updated: string[];
  /** Declared variables that gained a `derivation:`. */
  added: string[];
  /** Variables appended to the dataset because the spec did not declare them. */
  appended: string[];
}

/**
 * Edits that put Fleet's derivation blocks into *dataset*'s stanzas: an
 * existing `derivation:` is replaced, a declared variable gains one, and
 * an undeclared variable is appended with placeholders for the metadata
 * only a reviewer can supply. Everything else in the file stays as written.
 */
export function derivationEdits(
  text: string,
  dataset: SpecDataset,
  rows: DerivationRow[],
): DerivationEdits {
  const last = dataset.variables.at(-1);
  if (!last) throw new Error(`${dataset.name} declares no variables to place derivations in.`);
  const result: DerivationEdits = { edits: [], updated: [], added: [], appended: [] };
  const tail: string[] = [];
  for (const row of rows) {
    const variable = dataset.variables.find((entry) => entry.name === row.name);
    if (variable?.derivation) {
      const [start, end] = variable.derivation;
      result.edits.push({
        start,
        end: contentEnd(text, end),
        text: block(row.block, variable.indent),
      });
      result.updated.push(row.name);
    } else if (variable) {
      const at = contentEnd(text, variable.range[1]);
      result.edits.push({
        start: at,
        end: at,
        text: `\n${pad(variable.indent)}${block(row.block, variable.indent)}`,
      });
      result.added.push(row.name);
    } else {
      tail.push(
        `${pad(last.indent - 2)}- name: ${row.name}\n` +
          `${pad(last.indent)}label: ${row.label ?? row.name} # TODO: not declared before — review label, type and origin\n` +
          `${pad(last.indent)}${block(row.block, last.indent)}`,
      );
      result.appended.push(row.name);
    }
  }
  if (tail.length) {
    const at = contentEnd(text, last.range[1]);
    result.edits.push({ start: at, end: at, text: `\n${tail.join("\n")}` });
  }
  return result;
}

/** Apply offset edits, latest first so earlier offsets stay valid. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}

/** Configured standards, derived from `metadata_<standard>` keys in `paths:`. */
export function standards(
  config: StudyConfig,
): { id: string; metadata: string; data?: string; programs?: string }[] {
  return Object.entries(config.paths).flatMap(([key, metadata]) => {
    if (!key.startsWith("metadata_")) return [];
    const id = key.slice("metadata_".length);
    return [
      { id, metadata, data: config.paths[`${id}_data`], programs: config.paths[`programs_${id}`] },
    ];
  });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function age(then: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function named(map: YAMLMap): string | undefined {
  const name = map.get("name", true);
  return isScalar(name) && typeof name.value === "string" ? name.value : undefined;
}

function label(map: YAMLMap): string | undefined {
  const value: unknown = map.get("label");
  return typeof value === "string" ? value : undefined;
}

function strings(value: unknown): string[] {
  const list: unknown = isSeq(value) ? value.toJSON() : value;
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
}

/** `derivation:` rendered for a stanza whose keys sit at *indent*; the first line carries none. */
function block(derivation: Record<string, unknown>, indent: number): string {
  // YAML 1.1, as PyYAML reads it: a mapping value like "Y" or "No" must be quoted.
  return stringify({ derivation }, { version: "1.1", lineWidth: 0 })
    .trimEnd()
    .split("\n")
    .map((line, index) => (index ? pad(indent) + line : line))
    .join("\n");
}

/** A node's end offset can include its trailing newline; step back to the last character. */
function contentEnd(text: string, offset: number): number {
  let end = offset;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  return end;
}

function pad(width: number): string {
  return " ".repeat(Math.max(0, width));
}

function pairRange(map: YAMLMap, key: string): [number, number] | undefined {
  const pair = map.items.find((entry) => isScalar(entry.key) && entry.key.value === key);
  const start = isScalar(pair?.key) ? pair.key.range?.[0] : undefined;
  const end = isNode(pair?.value) ? pair.value.range?.[1] : undefined;
  return start !== undefined && end !== undefined ? [start, end] : undefined;
}

function lineOf(lines: LineCounter, map: YAMLMap): number {
  return lines.linePos(map.range?.[0] ?? 0).line - 1;
}

function stanza(text: string, lines: LineCounter, map: YAMLMap): string {
  const [start, end] = map.range ?? [0, 0];
  const indent = lines.linePos(start).col - 1;
  const [first, ...rest] = text.slice(start, end).trimEnd().split("\n");
  return [first, ...rest.map((line) => line.slice(Math.min(indent, leading(line))))].join("\n");
}

function leading(line: string): number {
  return line.length - line.trimStart().length;
}
