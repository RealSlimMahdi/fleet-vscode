> **Status (2026-09-10): audited against `fleet-vscode` `fable/fleet-workbench` (15254b8) and Fleet `fable/spec-code-conversion` (483ddc7).** Legend: ✅ implemented · 🟡 partial · ❌ not implemented. Every section below opens with a `Status` line saying what exists (with file paths; `src/fleet/…` is the Fleet repo, `src/*.ts` is this one) and what is still open; the 5.2 and 5.3 tables carry a `Status` column. This supersedes the 2026-09-03 audit against `main`; a line marked _unchanged_ was re-checked and still holds.
>
> | Tier                         | Status | Summary                                                                                                                                                           |
> | ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1 — LSP                      | 🟡     | Unchanged: 1.1 ✅, 1.5 🟡; 1.2–1.4 and 1.6–1.8 ❌. The server still serves the open file only; every remaining item is Fleet-side work behind `fleet.introspect`. |
> | 2 — Python-file intelligence | 🟡     | 2b and 2c ✅ statically (both `fable/*` branches; no IG pass), 2d 🟡 (spec conformance on demand, Define-XML preview after generation), 2a ❌.                    |
> | 3 — LLM features             | 🟡     | 3a/3b superseded: the study's `fleet mcp` server is registered with Copilot natively (`fable/fleet-workbench`); 3c ❌ by decision.                                |
> | 4 — Workflow UI              | 🟡     | 4a ✅ the Fleet view (no lineage-based progress), 4c 🟡 (QC compare, reports), 4b ❌ (a static version is now unblocked).                                         |
> | 5 — Architecture & packaging | 🟡     | 5.1 ✅ · 5.2 3 of 8 rows (unchanged) · 5.3 10 tools and the extension speaks MCP, still behind the `mcp` extra · 5.4 unpublished; engine floor now 1.101.         |
> | Implementation sequence      | 🟡     | 1 🟡, 2 ✅ (no DAG webview), 3 ✅, 4 ✅ static, 5 superseded, 6 ✅, 7 ❌.                                                                                         |
>
> **Where is what (2026-09-10).**
>
> | Branch                                  | Repo         | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                            |
> | --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | `fable/fleet-workbench` (15254b8)       | fleet-vscode | The study workbench. `src/tree.ts` (Fleet view), `src/tasks.ts` (`fleet` task provider), `src/navigation.ts` (hover / Go to Definition from Python, code lenses in `define.yaml`), `src/workbench.ts` (commands, MCP questions, Copilot registration, report preview, spec ↔ code), `src/study.ts` (study model), `src/spec.ts` and `src/mcp.ts` (pure: YAML positions and edits, one MCP call). Decisions and deferrals in `docs/workbench.md`. |
> | `fable/spec-code-conversion` (483ddc7)  | Fleet        | `src/fleet/core/spec_source.py` (static code → spec and spec → code on the registry) and the MCP tools `fleet_code_to_spec` / `fleet_spec_to_code` in `src/fleet/mcp_server.py`, plus the `mcp` 2.x compatibility import. Not on Fleet `main`.                                                                                                                                                                                                   |
> | `astra/fleet-study-workbench` (a3db52c) | fleet-vscode | The earlier proposal, kept as a snapshot for comparison.                                                                                                                                                                                                                                                                                                                                                                                         |
> | `main`                                  | both         | Fleet `main` (ebee9e2): LSP, 8 MCP tools, the registry, `to_spec_yaml()`. fleet-vscode `main` (7a112d5): the language-client shell only.                                                                                                                                                                                                                                                                                                         |
>
> End to end: check out both `fable/*` branches, install the study with `fleet-cdisc[lsp,mcp]` (the study is an editable install of `../Fleet`), run the extension from F5 or the packaged `.vsix`.

# Companion VS Code Extension & Language Server for Fleet — Updated Plan (May 2026)

**What changed since the original brainstorm:** Fleet has grown significantly. 200+ verbs across 12 namespaces. A full TLG/ARD pipeline. A pin system for cross-domain data access. Staged derivation ordering via `depends_on`. 9 validated example scripts. The overarching design principle for tooling must therefore be: **discover Fleet's surface dynamically from the installed package, never hardcode it.** Every feature that enumerates verbs, algorithms, or namespaces must call into the live Python runtime, because Fleet will keep growing.

---

## Tier 1: Language Server Protocol (LSP) for define.yaml

> **Status: 🟡 Partial — unchanged; all remaining items are Fleet-side.** `fleet lsp --stdio` (`src/fleet/lsp_server.py`, `lsp` extra) still registers diagnostics on open/change, completion and hover over the single open document, through `fleet.introspect` (ADR-0001). 1.1 and 1.5 are delivered; 1.2–1.4 and 1.6–1.8 need new introspect entry points before any client work. The extension adds non-semantic editor features around the spec on `fable/fleet-workbench` (`src/navigation.ts`: Run / Compare / Program code lenses on every dataset, hover and Go to Definition from a quoted variable in Python to its stanza).

**Approach:** A Python LSP via `pygls`, launched as `fleet lsp --stdio`, auto-discovered from the project `.venv` by the VS Code extension. Ship as `fleet-cdisc[lsp]` optional extra (adds only `pygls`). The LSP imports Fleet directly — it never hardcodes verb names, algorithm enums, or schema fields.

### 1.1 Schema-aware autocomplete

> **Status: ✅ Implemented, two caveats.** `algorithm:` values complete per inferred standard from `introspect.algorithms()` (registry-backed and deliberately uncached, so a new `spec_algorithm()` registration appears with no extension update); parameter keys complete from `introspect.get_algorithm().params` with required keys sorted first (`compute_completions`; tests in `tests/unit/test_lsp_server.py`). Caveat (a): Fleet's registry marks `assign_ct`'s `source` and `ct_codelist` as optional (`source` defaults to the target name), so the LSP does not require them — the premise below is wrong, not the server. Caveat (b): `algorithm: derivation` is ADaM-only (SDTM's free-form escape hatch is `callable`); `expression` completes as a key, but there is no hover on the `expression:` key and the quoted note does not exist.

The LSP reads `SDTMAlgorithm` and `ADAMAlgorithm` enums from the live Fleet package to populate `algorithm:` completions. New algorithm types added to Fleet appear in autocomplete immediately without an extension update.

For each algorithm, parameter completion is driven by the corresponding Pydantic model (`SDTMVariableSpec`, `ADAMVariableSpec`). When the user types `algorithm: assign_ct`, the LSP knows to require `source:` and `ct_codelist:` and to offer `ct_mapping:` as optional — because Pydantic validates it.

**Edge case:** `algorithm: derivation` accepts a free-form `expression:` string (arbitrary Polars syntax). The LSP does not attempt to validate Polars expressions, but it completes the key name and shows a hover note: _"Arbitrary Polars expression string, evaluated at runtime."_

### 1.2 `depends_on` field awareness

> **Status: ❌ Not implemented (unchanged 2026-09-10).** The LSP has no `depends_on` logic: the key is not offered in completions, values are not completed, same-dataset references are not validated, and no variable-level cycle check exists anywhere in Fleet (the only cycle detector is dataset-level, `build_dag._validate` in `src/fleet/core/dag.py`, which the LSP never calls). The key is merely tolerated by the generated schema on ADaM algorithms; on SDTM blocks it fails with the opaque schema `anyOf` message. Implementation-sequence item 1 lists this as shipped; it is not.

The define.yaml `depends_on:` field is ADVS-critical: `ADT → ADY → BASE → CHG`. The LSP must:

- Recognize `depends_on:` as a valid key in variable derivation blocks
- Complete with variable names from the same dataset's `variables:` list
- Validate that `depends_on:` references exist in the same dataset (no cross-dataset depends_on)
- Flag cycles within a single dataset's depends_on graph as a diagnostic

**Edge case:** `depends_on:` can be a list. Multi-stage chains (`[ADT, ABLFL]`) must all resolve within the dataset.

### 1.3 Multi-input dataset handling

> **Status: ❌ Not implemented (unchanged 2026-09-10).** No sibling-file or workspace parsing exists (every helper takes one document's text), so there is no `inputs[].name` validation, no `source:` value completion from input datasets, and no raw-input fallback note. `build_dag()` validates `inputs:` references, but only at runtime and via the MCP tools.

Datasets like ADVS have `inputs: [VS, ADSL]`. The LSP must:

- Validate that all `inputs[].name` values are defined elsewhere in the file (same define.yaml) or in a sibling define.yaml (SDTM domains referenced from ADaM)
- Support cross-file resolution: parse sibling YAML files in the same `examples/` subtree
- For `source:` values referencing upstream columns, offer completions from the union of all input datasets' known variables (read from their define.yaml `variables:` blocks)

**Edge case:** Raw inputs (`type: raw`) have no variable list — the LSP cannot offer completions for raw column names since they're in the CSV. It should show a fallback note: _"Source column from raw file — no schema available."_

### 1.4 Pin system in define.yaml

> **Status: ❌ Not implemented (unchanged 2026-09-10; #86/#87 not re-checked).** The LSP never reads `inputs:`. No author-time `dataset:`/`from_dataset:` reconciliation, no secondary-input annotation, and no YAML-boolean warning for a bare `on:` — that mistake surfaces only as the generic schema `anyOf` error on the `derivation:` line. Runtime `DependencyGraph.inject_lineage` exists (`src/fleet/core/dag.py`) but consumes pins from an executed pipeline, not spec text. #86 and #87 are still open (checked 2026-09-03).

The `pin:` pattern (cross-domain data access) **is** representable: `inputs:` declares
the edge, and `merge` / `lookup` / `first_date` / `last_date` / `count_events` carry
the join itself, resolving the pinned frame through a `convert="pin"` param. The LSP
should:

- Treat multiple `inputs:` as a semantic signal that cross-domain joins occur
- Flag a `dataset:` / `from_dataset:` value that is not declared in the enclosing
  dataset's `inputs:` — the same reconciliation `DependencyGraph.inject_lineage`
  performs at runtime, moved to author time
- Flag when a `source:` variable name exists only in a secondary input (not the primary), and annotate: _"Derived from input dataset [ADSL], not the primary input [VS]."_
- Warn that a bare `on:` key is a YAML boolean and must be quoted (#87)

### 1.5 Codelist hover and completion

> **Status: 🟡 Partial (unchanged 2026-09-10).** ✅ Hover on an OID declared in the file's own `codelists:` shows its name and first eight terms; ✅ `ct_codelist:`/`codelist:` values complete from that same section; ✅ `ct_mapping:` is optional end to end (registry → schema → completion order). ❌ No `codelists.py` fallback for undeclared OIDs (hover returns nothing); ❌ no `ct_mapping:` sub-key completion from `items[].coded_value` — inside a mapping block the server still offers algorithm parameter keys.

- Resolve `ct_codelist: C66731` to its human-readable name and valid terms from the define.yaml's own `codelists:` section — **no API call needed** (the codelist is always declared inline)
- For codelist OIDs not declared in the file, look up `codelists.py` in the project for the class-to-OID mapping
- Offer `ct_mapping:` sub-key completions from the codelist's declared `items[].coded_value` list

**Edge case:** Some define.yaml files omit `ct_mapping:` entirely (when raw data already matches the codelist). The LSP accepts this as valid — `ct_mapping:` is always optional when the source values already match coded_values.

### 1.6 DAG-aware diagnostics

> **Status: ❌ Not implemented (unchanged 2026-09-10).** `build_dag()` is never imported by the LSP (the ADR-0001 import sweep would fail, and `fleet.introspect` has no DAG entry point). There is no save handler (the 300 ms debounce is on `didChange` for the syntax/schema pass), no workspace-level diagnostics, and orphan detection does not exist even in Fleet core. Missing-input and cross-dataset cycle detection live in `dag._validate` and are reachable today only through MCP (`fleet_execution_order`).

Use `build_dag()` on the whole define.yaml to detect:

- Missing `inputs:` references (dataset not declared in this or sibling YAML)
- Topological cycles across datasets
- Orphan datasets (declared but never consumed by any other dataset)

Run this analysis on every file save (debounced 500ms). Surface as workspace-level diagnostics, not just file-level.

### 1.7 Variable lineage hover (when pipeline_dag.json exists)

> **Status: ❌ Not implemented (unchanged).** Hovering a variable in a Python program now shows its _declared_ stanza (`src/navigation.ts`, `fable/fleet-workbench`), not lineage: `fleet run` still never writes `pipeline_dag.json` (only an explicit `PipelineDAG.generate(path)` does, and its `variables` exist only after `inject_lineage()`). The astra proposal's lineage tree was dropped for that reason (`docs/workbench.md`). Writing lineage from `fleet run` is the single Fleet contract behind 1.7, the 4a progress counts and the exact 4b guardian.

When `outputs/*/pipeline_dag.json` is present (written by `build_dag(..., output_dir=...)`), the LSP enriches variable hover cards with runtime lineage:

```
TRTSDT — derived by first_date
  Sources: RFSTDTC, EXSTDTC
  Method: fleet.adam.adsl_namespace.ADSLNamespace.first_date
  [Click to open definition]
```

**Edge case:** If pipeline*dag.json is stale (older than the define.yaml mtime), show a warning badge: *"Lineage data may be outdated — re-run pipeline to refresh."\_

### 1.8 CDISC Library variable hover

> **Status: ❌ Not implemented (unchanged 2026-09-10).** No `.fleet/ig_cache/`, no variable hover, no CodeLens provider on either side. Fleet's CDISC Library client (`src/fleet/ct/api.py`, `CDISC_API_KEY`) serves CT downloads, and the define scaffolder fetches IG dataset listings live for `fleet init define`; neither caches per domain nor is reachable from the editor.

One-time cache per (standard, version) pair, stored in `.fleet/ig_cache/`. On hover over a variable name (USUBJID, AVAL, etc.), show: label, type, length, core/expected status, and CDISC notes. **If `.fleet/ig_cache/` has no entry for that domain, show a "Fetch from CDISC Library" CodeLens action** rather than auto-querying (network calls should always be opt-in from the editor).

---

## Tier 2: VS Code Extension — Pipeline Intelligence for Python Files

> **Status: 🟡 Partial.** 2b and 2c are implemented statically across the two `fable/*` branches, 2d has its DatasetChecker half on demand, 2a is not started. The extension is no longer a three-file launcher: `src/workbench.ts` hosts commands, tasks, MCP questions and one script-free webview. Fleet-core building blocks reached the editor through two new MCP tools (`fleet_code_to_spec`, `fleet_spec_to_code`) rather than through `fleet.introspect`.

### 2a. Pipeline DAG View

> **Status: ❌ Not implemented (unchanged).** The extension shows execution order and downstream impact as quick picks (`fleet.executionOrder`, `fleet.impact` in `src/workbench.ts`, over `fleet_execution_order` / `fleet_impacted_by`; the impact picker reruns the datasets Fleet listed), but no graph. The missing contract is a `fleet_dag` tool returning nodes and edges; `pipeline_dag.json` is not a source because nothing writes it.

**Prerequisite:** `pipeline_dag.json` does not currently exist in the repo — it is only written when `build_dag(..., output_dir=...)` is called explicitly. The extension must first offer a "Generate DAG" action that runs `uv run python -c "from fleet import build_dag; build_dag(...)"` using paths from `study_config.yaml`. Once the JSON exists, it polls for changes on save.

**Webview panel features:**

- Render dataset nodes as a directed graph (D3 or Cytoscape.js embedded in Webview). Node types colour-coded: `raw` (grey) / `sdtm` (blue) / `adam` (green) / `send` (gold)
- Expand a node to see its `variables` dict: each column with verb, sources, method link
- "What breaks?" input box — calls `dag.impacted_by(name)` and highlights the affected subgraph
- Topological execution order displayed as a numbered overlay on each node

**Edge cases:**

- Cycles are caught by `build_dag()` itself (raises `ValueError`) — the extension catches this and shows it as an error panel notification, not a crash
- Nodes with no `variables` recorded (spec-only, not yet materialised) show a "not run" placeholder, not an empty section

### 2b. "Convert to spec-driven" Code Action

> **Status: ✅ Implemented statically — Pass 1 and Pass 3; Pass 2 ❌.** Fleet `fable/spec-code-conversion`: `derivations_from_source()` in `src/fleet/core/spec_source.py` walks the program's AST (nothing runs) and reverse-maps every `.sdtm` / `.adam` verb call through `derivation_from_lineage()` on a synthetic `VariableNode`, so the registry decides; exposed as `fleet_code_to_spec(source)`. Statuses: `ok`, `stub` (non-literal arguments, positional extras, `**kwargs`), `unsupported` (`SPEC_UNSUPPORTED`), `unknown` (unregistered, which includes sub-namespace verbs until #89 is closed). A bare `.derivation(OBJ)` study derivation becomes `algorithm: callable` with the dotted path the program imports; `pin()` is skipped; the last derivation of a target wins; calls after `to_frame()` are ignored. Extension `fable/fleet-workbench`: **Push Derivations to Spec** (`fleet.pushToSpec`, editor-title button on Python files) writes the blocks with offset-exact edits (`derivationEdits()` in `src/spec.ts`, YAML 1.1 quoting): an existing block is replaced, a declared variable gains one, an undeclared variable is appended with a TODO; inline-only calls are listed with reasons. Not done: Pass 2 (no IG cache), `inputs:` maintenance, a preview diff, expressions and lambdas (need runtime lineage via `to_spec_yaml()`), chains held in a variable, and the lightbulb code-action form.

**Do not hand-maintain a representability table.** Fleet already computes one, and a
test keeps it honest — `tests/unit/test_spec_parity.py` fails when a public verb is
neither registered nor explicitly allowlisted:

- `fleet.core.spec_registry.coverage_matrix()` — every spec algorithm with its target
  verb, params and required params. **16 SDTM, 30 ADaM** as of 2026-08.
- `fleet.core.spec_registry.SPEC_UNSUPPORTED` — the verbs that deliberately have no
  spec form, each with the reason inline. **24 SDTM, 15 ADaM**.

⚠️ **Know the limit of that guarantee.** The parity test parametrises over
`SDTMNamespace` and `AdamNamespace` only, so the sub-namespaces reached through
`df.adam.occds`, `.adsl`, `.tte`, `.onco`, `.pk`, … are outside it — **51 distinct
verbs** with no spec story either way (#89). `occds.treatment_emergent` is one: a real
verb, absent from both the registry and `SPEC_UNSUPPORTED`. Until that closes, the code
action must treat "not in either list" as _unknown_, not as _supported_.

The code action must read both at runtime, exactly like the LSP reads the registry.

**Cross-domain derivations are representable.** Five algorithms resolve a pinned
dataset through a `convert="pin"` param — `_resolve_param` calls `ns._require_pin()`
with the declared name, so the join is expressed entirely in YAML:

| Standard | Algorithm      | Dataset param  | Join semantics                      |
| -------- | -------------- | -------------- | ----------------------------------- |
| sdtm     | `merge`        | `dataset`      | `on`, `how`, `target_cols`          |
| adam     | `lookup`       | `dataset`      | `on`, `how`, `target_cols`, `where` |
| adam     | `first_date`   | `from_dataset` | `date_col`, `where`, `groups`       |
| adam     | `last_date`    | `from_dataset` | `date_col`, `where`, `groups`       |
| adam     | `count_events` | `from_dataset` | `date_col`, `where`, `groups`       |

So `.pin("DM", dm).merge(...)` round-trips to an `inputs:` entry plus a `merge`
derivation. `DependencyGraph.inject_lineage` already reconciles `pin()` against
`inputs:` in both directions, warning on an undeclared pin and on a declared input
nothing consumed — the two are one fact, not two.

⚠️ Two live defects the code action must not paper over: `fleet run` never calls
`.pin()`, so pin-consuming specs are unrunnable from the CLI (#86); and `on:` is a
YAML 1.1 boolean, so the join key needs quoting (#87).

**What genuinely has no spec form** is `SPEC_UNSUPPORTED`, and it falls into four
kinds — worth knowing because the right fallback differs:

| Kind                                   | Examples                                                                     | What the action should emit                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pin sugar with a spec equivalent       | `join_adsl`, `merge_adsl`, `study_day`                                       | rewrite as `lookup` / `duration` — **not** a TODO                               |
| Multi-column or frame-reshaping output | `criterion`, `derive_param`, `derive_summary_records`, `derive_locf_records` | `# NOTE: derive inline after from_spec()` — no single target to attach to       |
| Per-mode wrappers                      | `flag_first`, `flag_last`, `flag_extreme`, `flag_exists`, `flag_relative`    | the underlying `flag` algorithm with the mode as a param (ADaM); inline on SDTM |
| Not derivations at all                 | `keep`, `verbs`, `export_supp`, the `TrialDesignMixin` scaffolding           | omit — these are pipeline plumbing, not variable derivations                    |

**Pass 1 — AST parsing (instant, no I/O):**

Walk the Python AST of the selected pipeline chain. For each verb call, extract keyword arguments. `coverage_matrix()` gives the algorithm and its param names; the AST gives the values.

`ct_codelist=SEX` → resolved to OID `C66731` via a local lookup of `codelists.py` in the project (no API call).

**Prior art:** `spec_registry.derivation_from_lineage()` already turns a materialised
`VariableNode` into an `(algorithm, block, extras)` triple. It works from **runtime
lineage** rather than the AST, so it needs the pipeline to have run — but it is the
same mapping problem, already solved once. Reuse it or mirror its logic rather than
inventing a second one.

**Pass 2 — CDISC Library API (one batch call per domain, cached):**

Fills the metadata fields that are invisible in code: `label`, `type`, `length`, `mandatory`, `origin`. Strategy:

- One HTTP GET per domain to the CDISC IG endpoint: `GET /mdr/sdtmig/3-4/datasets/{domain}/variables` returns all variables for the domain in a single payload
- Cache response as `.fleet/ig_cache/sdtmig-3.4/{domain}.json` — reused forever unless explicitly invalidated
- Match variable names from the pipeline against the IG response
- For non-standard variables (custom ADVS parameterization, sponsor-specific analysis variables): no IG match → emit `label: # TODO`, `type: # TODO` with a comment

**Edge case:** No CDISC API key → skip Pass 2 entirely, emit all metadata fields as `# TODO` with a note: _"Set CDISC_API_KEY to auto-populate from CDISC Library."_

**Edge case:** ADaM variables (AVAL, ADT, ABLFL) → use ADaMIG endpoint instead of SDTMIG. The extension infers the standard from the namespace in the pipeline (`.adam.*` → ADaMIG, `.sdtm` → SDTMIG).

**Pass 3 — merge and emit:**

- Variables with complete AST + IG metadata → full stanza, ready to use
- Variables with partial derivation (complex verbs) → stanza with `# TODO: fill expression` inline
- Cross-domain joins (`pin` + `merge`/`lookup`/`first_date`/…) → an `inputs:` entry plus the full derivation. **These are representable; do not stub them.**
- Variables in `SPEC_UNSUPPORTED` → full metadata stanza + `derivation:` replaced with a prominently commented `# NOTE: derive inline after from_spec()`
- Order variables in output YAML to match the order they appear in the pipeline chain

**Completeness note:** For a typical SDTM DM pipeline (~14 variables, mostly `assign_no_ct` / `assign_ct` / `hardcode_no_ct`), the action generates a fully-populated define.yaml stanza with zero manual edits. Coverage for event-level datasets is higher than an earlier draft of this plan assumed, because cross-domain joins turned out to be expressible; the honest floor is whatever `SPEC_UNSUPPORTED` says at the time, so measure it rather than quoting a percentage.

### 2c. Reverse direction: define.yaml → skeleton inline pipeline

> **Status: ✅ Implemented.** `program_from_spec()` (same Fleet module) renders one chained call per derived variable through `render_formal_expression()`, the registry's faithful call — so `lookup` renders as `.merge(...)` — with placeholder loads for `inputs:`, `.pin()` for pinned datasets, and `callable:` as the bare `.derivation(NAME)` plus its import (dotted path or `derivations_module:`). Exposed as `fleet_spec_to_code(define_yaml, dataset)`; the extension's **Generate Program from Spec** writes it as `programs/<std>/<name>.py` when none exists, or shows it beside the program. Not done: `codelists.py` imports for CT values; custom-dispatch algorithms other than `callable` (`nsv`, `pick`) render from their parameter tables and need review.

Read a define.yaml dataset block and generate a Python pipeline skeleton:

- `algorithm: hardcode_no_ct` → `.sdtm.hardcode_no_ct("DOMAIN", value="DM")`
- `algorithm: assign_ct` with `ct_codelist: C66731` → `.assign_ct("SEX", source="sex", ct_codelist=SEX, ct_mapping={...})`
- `algorithm: derivation` → `.sdtm.derivation("AVAL", expression=<expression from YAML>)` or `.adam.derivation(...)` based on standard
- `algorithm: source` → `.assign_no_ct(...)` (SDTM) or `.source(...)` (ADaM)
- Variables with `# TODO` comments → emitted as stub comments in the Python chain

Imports are auto-generated: `from examples.{study}.{standard}.codelists import SEX, RACE` based on `ct_codelist:` references found in the YAML.

### 2d. Live Validation Panel

> **Status: 🟡 Partial.** DatasetChecker ✅ on demand: **Check Dataset Against Spec** (`fleet.checkDataset`) calls `fleet_dataset_check` and places missing/extra columns, type mismatches and CT findings as Problems on the spec lines they concern (`conformance()` in `src/workbench.ts`); ❌ not automatic after `to_frame()` or `fleet run`. CT on save ❌. Define-XML preview 🟡: **Generate Define-XML** runs `fleet define-xml --standard …` as a task and offers `define_<std>_preview.html` in a script-free webview; not live (`--watch` unused). TLG 🟡: HTML outputs under `outputs/` are listed in the view and previewable, **Open in Browser** for the interactive `tlg explore` page; `fleet tlg run` is not launched from the editor.

- **CT on save:** Run `CTValidator.validate_value()` for every `assign_ct` call in the file. Surface mismatches as diagnostics
- **DatasetChecker integration:** After `to_frame()` materialises a dataset, if a define.yaml entry exists for it, run `DatasetChecker.check()` and show column mismatches, type errors, and missing required columns in the Problems panel
- **Define-XML preview:** Webview rendering of define.yaml via `DefineSpecGenerator` + the bundled `define2-1.xsl` — same output as `fleet define-xml` but live-updating on YAML save
- **TLG preview:** For a pipeline ending in `.to_html()`, "Preview Table" button renders the ARD output in a Webview panel. ARD format is {cards}-compatible — the panel can optionally show the long-format ARD alongside the formatted table for debugging

---

## Tier 3: LLM-Enhanced Features

> **Status: 🟡 Superseded in part.** The extension registers each study's `fleet mcp --stdio` through `vscode.lm.registerMcpServerDefinitionProvider` (`mcpDefinition()` in `src/workbench.ts`; engine floor raised to `^1.101.0` for it), so Copilot Chat can call all ten tools without a participant and without editing settings. No Copilot, Chat or Language Model API is used otherwise, and no data leaves the machine unless chat is used.

### 3a. Fleet-Tuned Copilot Context

> **Status: ❌ Not implemented (Fleet-side prerequisites 🟡, unchanged).** `llms.txt` exists and `scripts/build_llms.py --check` gates Fleet's CI, but only verb signatures and one-line summaries are introspected live; the per-namespace verb lists are hand-curated (the script calls them an "editorial filter"), so "no manual curation" does not hold. `copilot-instructions.md` does not exist in either repo; its intended content lives in Fleet's path-scoped `.github/instructions/*.instructions.md` files and `AGENTS.md`. The extension touches none of this and builds no prompts. What changed: Fleet's tools are reachable from chat through the MCP registration (Tier 3 status), which covers the grounding this section wanted.

- **`llms.txt` injection:** The extension detects when Copilot is active and points to the project's `llms.txt` for context injection. `llms.txt` is auto-generated by `build_llms.py` via live introspection of the installed package — as Fleet grows, `llms.txt` grows automatically. No manual curation needed.
- **`copilot-instructions.md` is already in the repo** — it wires Fleet's verb grammar, codelist rules, mixin discipline, and docstring conventions into Copilot's system context. The extension's value-add is keeping it up to date when `build_llms.py --check` detects drift.
- **define.yaml grounding:** When the user asks Copilot to generate a pipeline, the extension automatically appends the relevant define.yaml stanza as a code block in the prompt. The LLM generates from the actual spec, not from training data guesses about CDISCPILOT01.

### 3b. Chat Participant `@fleet`

> **Status: ❌ Not implemented as a participant — superseded by the MCP registration (Tier 3 status).** The listed commands map onto tools chat can already call: `impacted_by` → `fleet_impacted_by`, `validate` → `fleet_validate`, `convert to spec` / `convert to inline` → `fleet_code_to_spec` / `fleet_spec_to_code`, `tlg preview` → `fleet_tlg_run`. `generate DM from raw` and `what's missing for submission` still need the IG cache (1.8).

Full participant registration in the VS Code extension. Key commands, grounded in specific Fleet APIs:

- **`@fleet generate DM from raw_dm.csv`** — Reads raw file headers (via `load_raw_data` → `.schema`), fetches CDISC IG variable list (cached), generates a `.sdtm` chain with correct verb selection per variable type. Emits `from codelists import ...` imports automatically
- **`@fleet explain this pipeline`** — Takes selected Python code, runs AST analysis + `lineage_of()` if available, produces step-by-step walkthrough citing `VariableNode.method` for docstring links
- **`@fleet what's missing for DM submission?`** — Compares the pipeline's output columns against the IG required/expected list for the domain. Uses the same cached IG API response as the "Convert to spec" feature
- **`@fleet impacted_by ae_raw`** — Calls `dag.impacted_by("ae_raw")` on the project's DAG and presents the ordered re-run list with dataset types and file paths
- **`@fleet convert to spec`** / **`@fleet convert to inline`** — Invokes the Tier 2b code action via the chat interface, with conversational output instead of in-editor YAML insertion
- **`@fleet validate`** — Runs `ValidationService`, presents results with verb-attributed findings (from `VariableNode.method` lineage)
- **`@fleet tlg preview`** — Executes the TLG builder chain in an isolated subprocess, renders HTML, opens Webview

**Forward-compatibility:** The `@fleet` participant discovers available verbs from the project's installed Fleet package, not from a bundled list. If a new TA namespace (`df.adam.cardiac`) is added in Fleet 0.5, `@fleet generate` picks it up immediately via dynamic introspection.

### 3c. RAG from CDISC Library

> **Status: ❌ Not implemented (deferred by decision; `docs/workbench.md`).** No vector store, embedding pipeline, or dependency for one. `fleet init rules` does cache conformance rules as YAML, but under `metadata/{sdtm,adam}/rules/` (per `study_config.yaml`), not `.fleet/rules/`.

- **Local vector store** (ChromaDB or SQLite-vec, shipped with the extension): Index the CDISC IG variable definitions, implementation notes, and CDISC conformance rules (from `.fleet/rules/`) as retrieved by `fleet init rules`
- **Conformance rules cache:** `fleet init rules` already downloads rules as human-readable YAML. The extension indexes these into the vector store, so `@fleet validate` explanations can cite the specific rule text
- **Community patterns:** Index pharmaverse admiral patterns (from public documentation) and map to Fleet equivalents for users migrating from R

---

## Tier 4: Workflow & Collaboration Features

> **Status: 🟡 Partial.** `package.json` on `fable/fleet-workbench` contributes the `fleet` view container and `fleet.study` view, view and context menus, a `fleet` task definition and an MCP server definition provider; `src/navigation.ts` registers code lenses and Python hover/definition. Nothing listens to Python saves yet.

### 4a. Study Explorer Sidebar (TreeView)

> **Status: ✅ Implemented, minus progress.** `StudyTree` in `src/tree.ts`: study → standard (`define.yaml`) → dataset → variable, from `study_config.yaml` with Fleet's path defaults applied (`src/spec.ts`), plus a Reports node listing what Fleet wrote, newest first. Each dataset row shows its output file and age and is highlighted when older than the spec or the program (an mtime hint, never proof); every row opens its source line; dataset rows carry run / compare / check / impact / program actions. ❌ No "14/14 vars derived" counts (needs `fleet run` to write lineage), no staged-derivation note (needs a `depends_on` graph), no validation-status node (validation reports show under Reports).

Root node is `study_config.yaml`. Hierarchy:

```
📁 CDISCPILOT01
├── 📋 Study Config
├── 🗄️ Raw Data (datasets/cdiscpilot01/raw/)
│   ├── dm_raw.csv (linked to → DM in DAG)
│   └── ae_raw.csv (linked to → AE in DAG)
├── 📊 SDTM
│   ├── DM  ✅  14/14 vars derived
│   ├── AE  ⚠️  10/18 vars → missing: AETOXGR, AEACN
│   └── VS  ❌  not run
├── 📈 ADaM
│   ├── ADSL ✅  22/22 vars derived
│   ├── ADVS ⚠️  3/15 vars (staged — run DM, VS first)
│   └── ADAE ❌  not started
├── 🔗 Pipeline DAG  (⚠️ stale — click to regenerate)
├── 📝 Define-XML
│   ├── SDTM define.xml  (last built: 2026-05-15)
│   └── ADaM define.xml  (not built)
├── 📊 TLG
│   ├── ae_summary.html
│   └── vs_summary.html
└── ✅ Validation Status  (last run: never)
```

**Progress tracking:** Compare define.yaml `variables:` count against `pipeline_dag.json`'s `variables` dict for each node. If `variables` dict is absent (node not yet materialised), show ❌. If variable count matches, show ✅. If partial, show ⚠️ with missing variable names in tooltip.

**Edge case:** ADSL has `depends_on` chains. When ADSL shows ⚠️, the sidebar must note _"Staged derivation: run ADSL first pass before CHG/PCHG columns are available."_ — derived from the `depends_on` graph, not from guessing.

### 4b. Spec-Code Sync Guardian

> **Status: ❌ Not implemented — no longer blocked.** A static guardian is possible on the existing tools: on save, `fleet_code_to_spec` names the derived variables, and the difference against the spec gives both diagnostics; the "push to spec" quick-fix is the existing `fleet.pushToSpec`. The tool's statuses already tell `SPEC_UNSUPPORTED` and unknown verbs apart. Exact drift (lineage vs spec) still waits on `fleet run` writing lineage.

Drift detection on every Python file save:

1. Parse the `_lineage` from the last materialisation (if `pipeline_dag.json` is current)
2. For each variable in lineage, check if it has a matching entry in define.yaml
3. If a lineage variable is absent from define.yaml → yellow warning: _"MYVAR derived in code but not in spec. Push to spec?"_
4. If a define.yaml variable has no lineage entry → blue info: _"MYVAR declared in spec but not derived in this pipeline."_

**"Push to spec" quick-fix:** Inserts a generated stanza into define.yaml at the correct position (after the last variable in the dataset block). Uses Pass 1 AST analysis + Pass 2 CDISC API (if key available).

**Edge case:** Variables whose verb is in `SPEC_UNSUPPORTED` cannot be pushed to spec. Read that set at runtime rather than hardcoding names — `seq` and ADaM `flag` _are_ registered algorithms, so a hardcoded list would wrongly refuse them (SDTM `flag` genuinely is not: the standards differ). Sub-namespace verbs such as `occds.treatment_emergent` are in neither list and should be reported as unknown rather than guessed. The guardian marks the genuine ones with a distinct icon: _"Inline-only derivation — spec representation not supported."_

### 4c. Test & Example Runner

> **Status: 🟡 Partial.** Golden-master diffing ✅ as **Compare with QC** (`fleet.compare`): `fleet compare <qc> <output> --keys … --report …` with keys prefilled from the spec's `keys:`, the exit code turned into a notification that opens the HTML report. ❌ Gutter run buttons (the Python extension runs `# %%` cells), ❌ DataFrame viewer (needs a bounded preview tool in Fleet), ❌ changed-column → verb links (lineage). 🟡 TLG/ARD: outputs previewable in the view, **Open in Browser** for `tlg explore`.

- **Gutter run buttons** for pipeline chains (`.sdtm.` / `.adam.` chains ending in `.to_frame()`): materialise the chain in a subprocess and display the resulting DataFrame in a VS Code table Webview
- **Golden master diffing:** After running, diff against a saved reference output (CSV/Parquet). Highlight changed cells; link changed columns back to the `VariableNode.verb` that produced them
- **TLG preview:** For `.to_html()`, `.to_ard()`, render inline in Webview
- **ARD inspector:** For `.to_ard()` output, show both the formatted table view and the underlying long-format ARD side by side — helps users understand the {cards}-compatible structure

---

## Tier 5: Architecture & Packaging

### 5.1 Hybrid architecture (recommended)

> **Status: ✅ Implemented.** The discovery ladder is unchanged (`src/server.ts`); the same executable now launches every `fleet` task and `fleet mcp` (`discoverFleetCommand()`, `fleetCommand()` in `src/study.ts`), so commands run in the environment that serves the editor. The extension layer now has the tree, code lenses, tasks and one webview; the Chat Participant row is superseded by MCP registration. Forward compatibility is as before: `fleet.introspect` for the LSP, `MINIMUM_FLEET_VERSION` in `src/version.ts`, and tool availability checked per call (`listTools` before `callTool`).

TypeScript extension shell + Python LSP backend.

| Layer             | Responsibility                                                                                            | Language         |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| VS Code extension | UI: TreeView, Webview, Chat Participant, gutter icons, CodeLens                                           | TypeScript       |
| Python LSP        | Semantic logic: define.yaml validation, verb completions, DAG analysis, CDISC API                         | Python (`pygls`) |
| Fleet package     | All business logic: `build_dag()`, `lineage_of()`, `CTValidator`, `DatasetChecker`, `DefineSpecGenerator` | Python           |

**LSP discovery order** — as shipped by [`fleet-vscode`](https://github.com/RealSlimMahdi/fleet-vscode), which is now the source of truth:

1. The `fleet.server.path` setting (an explicit `fleet` executable)
2. `FLEET_LSP` env var (the worktree escape hatch)
3. `.venv/bin/fleet lsp` in the workspace root (standard `uv sync` install)
4. `uv run fleet lsp` (resolves the project environment)

The planned bundled fallback LSP was dropped: the client reports a startup failure instead of degrading to YAML-only syntax checking.

**Forward-compatibility principle:** The LSP imports Fleet dynamically at startup. It calls `importlib.import_module("fleet")` and inspects the live package for verb lists, algorithm enums, namespace exports, and Pydantic model fields. When Fleet releases a new version, the LSP capabilities update automatically without a VS Code extension update.

### 5.2 What to hardcode vs. discover dynamically

> **Status: 🟡 Partial — 3 of 8 rows exercised (unchanged 2026-09-10).** The LSP discovers spec _algorithm_ ids, parameters and the schema live; it never enumerates verbs per namespace, reads `codelists.py`, caches IG metadata, or reads `fleet.__all__`. Row-by-row status is in the table.

| Item                        | Approach                                                          | Reason                               | Status                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verb names per namespace    | Discover via `inspect.getmembers(namespace_class)` at LSP startup | Grows with every Fleet release       | ❌ No verb enumeration anywhere; hover resolves one verb through `algorithm_resolver._candidate_namespaces()`, a fixed list of namespace classes |
| Algorithm enum values       | Import `SDTMAlgorithm`, `ADAMAlgorithm`                           | Enum-driven — safe to import         | ✅ Via `introspect.algorithms()` → registry (enums kept in sync by test; aliases such as `assign_dtc` are not offered)                           |
| define.yaml JSON schema     | Read `define_spec_schema.json` bundled with Fleet package         | Versioned with Fleet                 | ✅ `introspect.define_schema()` reads the packaged JSON; a sync test guards staleness                                                            |
| Pydantic field requirements | Import model and call `.model_fields`                             | Zero duplication of constraint logic | ✅ The same `Param(required=…)` declaration builds the models and feeds `ParamInfo.required`                                                     |
| Codelist OIDs               | Read `codelists.py` at workspace path                             | Project-specific, not in Fleet core  | ❌ Only the open file's inline `codelists:` section                                                                                              |
| CDISC IG metadata           | Cache in `.fleet/ig_cache/` — fetch once per domain               | API-rate-limited, slow               | ❌ No cache; the scaffolder fetches live                                                                                                         |
| CT term values              | Import `CTValidator` and call `.get_valid_values()`               | Always in sync with loaded CT        | 🟡 MCP `fleet_ct_terms` only; LSP hover reads the inline items                                                                                   |
| Namespace registry          | Read `fleet.__all__` or `fleet` module exports                    | Discovers new TAs automatically      | ❌ Not read by any tooling; `__all__` is hand-maintained                                                                                         |

### 5.3 MCP Server

> **Status: 🟡 Partial — 10 tools, extension wired.** `fleet mcp --stdio` ships 8 tools on Fleet `main` and 10 on `fable/spec-code-conversion` (`fleet_code_to_spec`, `fleet_spec_to_code`); still behind the `mcp` extra, now importing on both `mcp` 1.x and 2.x (`FastMCP` became `MCPServer`; a fresh install pulls 2.x). The extension speaks MCP: `callTool()` in `src/mcp.ts` asks one question per process (the server's last stderr line replaces the SDK's "Connection closed"), behind execution order, impact, dataset check and both conversions; the study's server is also registered with Copilot. `fleet_cdisc_lookup` still does not exist.

Expose Fleet as an MCP server. Each tool maps directly to an existing public API:

| MCP Tool                                         | Fleet API                                | Notes                          | Status                                                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fleet_execution_order(spec_paths)`              | `build_dag(*paths).execution_order()`    | Returns ordered list           | ✅ Exact; behind the extension's **Show Execution Order**                                                                                                                                                 |
| `fleet_impacted_by(spec_paths, node)`            | `dag.impacted_by(node)`                  | Returns re-run list            | ✅ Exact; behind **What Changes Downstream?**, whose picker reruns the chosen datasets                                                                                                                    |
| `fleet_inspect_lineage(dag_json_path, dataset)`  | Parse pipeline_dag.json                  | Returns VariableNode records   | ✅ Shipped as `fleet_lineage`; returns the node record, whose `variables` exist only if `inject_lineage()` ran before `generate()`. No consumer in the extension: `fleet run` never writes the file       |
| `fleet_validate(dataset_path, domain)`           | `ValidationService.run()`                | Returns ValidationResult       | ✅ Shipped as `fleet_validate(dataset_path, standard, version=None)`; domain from the file stem; calls `validate_sdtm`/`validate_adam` (`ValidationService.run()` does not exist); needs the rules engine |
| `fleet_ct_terms(codelist_id)`                    | `CTValidator.get_valid_values(codelist)` | Returns valid terms            | ✅ `fleet_ct_terms(codelist, ct_path=None)`                                                                                                                                                               |
| `fleet_cdisc_lookup(variable, domain)`           | Cached IG API response                   | Returns label/type/core        | ❌ Absent; no IG cache in Fleet (unchanged)                                                                                                                                                               |
| `fleet_tlg_preview(ard_json)`                    | `render_html(TableModel)`                | Returns HTML string            | 🟡 Replaced by `fleet_tlg_catalog()` and `fleet_tlg_run(spec_path, data_path, adsl_path, groupby)` — runs a spec, does not take ARD JSON                                                                  |
| `fleet_dataset_check(parquet_path, define_yaml)` | `DatasetChecker.check()`                 | Returns CheckResult            | ✅ `fleet_dataset_check(data_path, define_yaml, dataset)`; any loader-supported format. Behind **Check Dataset Against Spec**, which puts the result in Problems                                          |
| `fleet_code_to_spec(source)` (new)               | `spec_source.derivations_from_source()`  | Static AST → derivation blocks | ✅ New on Fleet `fable/spec-code-conversion`; behind **Push Derivations to Spec**                                                                                                                         |
| `fleet_spec_to_code(define_yaml, dataset)` (new) | `spec_source.program_from_spec()`        | Spec → inline program text     | ✅ New on Fleet `fable/spec-code-conversion`; behind **Generate Program from Spec**                                                                                                                       |

The MCP server runs as `fleet mcp --stdio` — a new CLI subcommand. It imports Fleet directly (same process), so it's always version-locked.

### 5.4 Packaging

- VS Code extension: `fleet-cdisc` on the Marketplace — TypeScript, lightweight shell
  - 🟡 A full workbench on `fable/fleet-workbench`, Marketplace identifier `fleet-vscode.fleet-vscode` (display name "Fleet CDISC"), still unpublished: the release workflow is gated by `scripts/verify-fleet-release.ts` until PyPI `fleet-cdisc` ships the `lsp` extra. Engine floor raised to `^1.101.0` for the MCP provider API; `npm run package` produces a shippable 8-entry VSIX.
- Python LSP: `fleet-cdisc[lsp]` — adds only `pygls` (≤ 50KB) to Fleet's existing deps
  - 🟡 The extra declares only `pygls`, but that pulls `lsprotocol` and `cattrs` too (well over 50 KB). Packaging defect: the `pygls>=1.3` floor predates the `pygls.lsp.server` import path the server uses (pygls 2.x), and `_require_extra` only checks that `pygls` is importable, so a 1.x install passes the guard and fails at startup.
- MCP server: `fleet mcp --stdio` CLI command — no extra deps beyond Fleet core
  - 🟡 The command exists, but requires `fleet-cdisc[mcp]`; it is not in core. The import now works on `mcp` 1.x and 2.x (`fable/spec-code-conversion`) after a fresh install pulled 2.x and failed on the renamed `FastMCP`.
- Extension auto-discovers the LSP/MCP server via the workspace `.venv` or `uv run fleet`
  - ✅ For the LSP, every `fleet` task and `fleet mcp` (`src/server.ts`, `src/study.ts`, `fable/fleet-workbench`); the MCP server is also registered with VS Code's MCP support so Copilot finds it.

---

## Implementation Sequence

1. 🟡 **`fleet lsp --stdio` CLI command** — the foundation everything else builds on. Ships with `pygls` in the `lsp` extra. Provides: define.yaml schema validation, algorithm autocomplete, codelist hover, depends_on cycle detection. Scope: ~500 LOC. **Status:** command, `lsp` extra, schema validation, algorithm autocomplete and inline-codelist hover ✅; `depends_on` cycle detection ❌ (exists nowhere in Fleet).

2. ✅ **VS Code extension shell** — TypeScript wrapper that launches `fleet lsp`, registers the extension on `.yaml` files in `examples/` directories, and provides the DAG Webview panel. Scope: ~300 LOC TypeScript + LSP launch code. **Status:** shell ✅; workbench ✅ on `fable/fleet-workbench` — tree, tasks, code lenses, hover/definition, MCP questions, Copilot registration, report preview, spec ↔ code (about 1,600 lines of TypeScript with unit and Extension Host tests); the selector stays `**/define*.yaml`; DAG webview ❌.

3. ✅ **`fleet mcp --stdio` CLI command** — expose the 8 tools above. Ships in Fleet core (no extra deps). Immediately amplifies every MCP-compatible AI. Scope: ~200 LOC. **Status:** command ✅; 6 of the 8 planned tools plus `fleet_code_to_spec` / `fleet_spec_to_code` on `fable/spec-code-conversion`; still behind the `mcp` extra; `mcp` 2.x supported.

4. 🟡 **"Convert to spec-driven" code action** — AST parsing + CDISC API caching. The hardest feature, but the most valuable for spec-driven workflow adoption. Scope: ~600 LOC (AST walker + IG API client + YAML emitter). **Status:** static conversion ✅ in both directions (2b, 2c), delivered as commands and an editor-title button rather than a lightbulb code action; IG pass ❌.

5. 🟡 **`@fleet` Chat Participant** — registered in the VS Code extension. Grounded in: `llms.txt`, project define.yaml, `pipeline_dag.json` lineage. Scope: ~400 LOC TypeScript (mostly prompt construction and result formatting). **Status:** superseded — the extension registers Fleet's MCP server with Copilot (Tier 3); no participant planned.

6. ✅ **Study Explorer Sidebar** — TreeView wiring `study_config.yaml` → define.yaml → `pipeline_dag.json`. Scope: ~300 LOC TypeScript. **Status:** shipped as the Fleet view (`src/tree.ts`, `fable/fleet-workbench`); progress counts wait on lineage (4a).

7. ❌ **Spec-Code Sync Guardian** — file-save listener + lineage comparison + quick-fix CodeAction. Scope: ~200 LOC Python in LSP + ~100 LOC TypeScript. **Status:** not started; a static version is now feasible on the existing tools (4b).
