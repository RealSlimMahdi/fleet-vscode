// Slices the canonical Fleet study's define.yaml down to the committed fixture.
//
// The fixture is generated, never hand-edited: rerun `npm run fixture` after the
// canonical study changes. Point FLEET_STUDY at a different checkout to reslice
// from somewhere other than the sibling `../test-study`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const study = process.env.FLEET_STUDY ?? resolve(root, "..", "test-study");
const source = resolve(study, "metadata", "sdtm", "define.yaml");
const target = resolve(root, "fixture", "metadata", "sdtm", "define.yaml");

// Fleet reads specs with PyYAML, which is YAML 1.1: round-tripping at 1.2
// would unquote `"2023-12-15"` into a timestamp and invent a schema error the
// canonical study does not have.
const DIALECT = { version: "1.1" };

// Enough to exercise codelist completions and one derivation block, small
// enough to read in a single screen.
const CODELISTS = 3;
const VARIABLES = 6;

const spec = parse(readFileSync(source, "utf8"), DIALECT);
const [dataset] = spec.datasets;

const header = [
  "# Fixture for the Extension Development Host — generated, do not edit.",
  `# Regenerate with \`npm run fixture\` (slices ${CODELISTS} codelists and the`,
  `# first ${VARIABLES} ${dataset.name} variables out of the canonical study).`,
  "",
].join("\n");

const fixture = {
  study: spec.study,
  codelists: spec.codelists.slice(0, CODELISTS),
  datasets: [{ ...dataset, variables: dataset.variables.slice(0, VARIABLES) }],
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, header + stringify(fixture, DIALECT), "utf8");

console.log(`Wrote ${target} from ${source}`);
