// Slices the canonical Fleet study down to the committed fixture.
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
const fixture = resolve(root, "fixture");

// Fleet reads specs with PyYAML, which is YAML 1.1: round-tripping at 1.2
// would unquote `"2023-12-15"` into a timestamp and invent a schema error the
// canonical study does not have.
const DIALECT = { version: "1.1" };

// Enough to exercise codelist completions and one derivation block, small
// enough to read in a single screen.
const CODELISTS = 3;
const VARIABLES = 6;

const GENERATED = "generated, do not edit.";

// ── metadata/sdtm/define.yaml ──────────────────────────────────────────────

const specSource = resolve(study, "metadata", "sdtm", "define.yaml");
const spec = parse(readFileSync(specSource, "utf8"), DIALECT);
const [dataset] = spec.datasets;

write(
  resolve(fixture, "metadata", "sdtm", "define.yaml"),
  [
    `# Fixture for the Extension Development Host — ${GENERATED}`,
    `# Regenerate with \`npm run fixture\` (slices ${CODELISTS} codelists and the`,
    `# first ${VARIABLES} ${dataset.name} variables out of the canonical study).`,
    "",
  ].join("\n") +
    stringify(
      {
        study: spec.study,
        codelists: spec.codelists.slice(0, CODELISTS),
        datasets: [{ ...dataset, variables: dataset.variables.slice(0, VARIABLES) }],
      },
      DIALECT,
    ),
  specSource,
);

// ── study_config.yaml ──────────────────────────────────────────────────────
// Identity and paths only: what the workbench needs to find the spec, the
// outputs and the programs. IG versions and domain lists stay out.

const configSource = resolve(study, "study_config.yaml");
const config = parse(readFileSync(configSource, "utf8"), DIALECT);

write(
  resolve(fixture, "study_config.yaml"),
  `# Fixture for the Extension Development Host — ${GENERATED}\n` +
    stringify({ study_id: config.study_id, paths: config.paths }, DIALECT),
  configSource,
);

// ── programs/sdtm/<dataset>.py ─────────────────────────────────────────────
// The program the workbench pairs with the sliced dataset by convention. It
// names the dataset's third variable, so spec ↔ code navigation has a target.

const variable = dataset.variables[2].name;
write(
  resolve(fixture, config.paths.programs_sdtm, `${dataset.name.toLowerCase()}.py`),
  [
    `# Fixture for the Extension Development Host — ${GENERATED}`,
    "# %%",
    "import fleet",
    "import polars as pl",
    "",
    "# %%",
    `${dataset.name.toLowerCase()} = (`,
    `    fleet.frame(pl.read_csv("../../data/raw/${dataset.name.toLowerCase()}_raw.csv"))`,
    `    .sdtm.assign("${variable}", source="subject_id")`,
    "    .to_frame()",
    ")",
    "",
  ].join("\n"),
  specSource,
);

function write(target, content, source) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  console.log(`Wrote ${target} from ${source}`);
}
