# Workbench design notes

Why the extension looks the way it does, and what was deliberately left out. Written on
10 September 2026 while consolidating the `astra/fleet-study-workbench` proposal.

## Three rules

1. **Fleet owns the meaning.** The extension decides what to ask, in which folder, and how
   to show the answer. It never parses a derivation, walks a DAG or judges conformance.
   When a feature needs knowledge Fleet does not expose yet, it waits (see the last section).
2. **Native first.** Tasks instead of a process manager, Problems instead of a findings
   panel, code lenses and hover instead of a webview, VS Code's MCP registration instead of
   generated JSON, the Explorer instead of a second file browser.
3. **The daily loop first.** Edit the program → run → look at the output → compare with the
   QC copy → validate → hand over a report. Everything on the critical path is one click
   from the spec, the program or the tree; everything else is a palette command.

## Kept from the astra proposal

| Kept                                    | Changed how                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| Study tree                              | Semantic rows only: no directory browsing, no lineage from a file never written |
| CLI commands as VS Code tasks           | A task provider, so tasks show in _Run Task_ and `tasks.json` can extend them   |
| Execution order and impact over MCP     | Results land in a picker; the impact picker can rerun exactly what Fleet listed |
| Compare on explicit keys                | Keys prefilled from the spec's `keys:`; the HTML report is offered when done    |
| Script-free report preview              | Webview with scripts off and a CSP — no `sanitize-html` dependency              |
| `discoverFleetCommand`, MCP test server | As is                                                                           |

## Dropped, and why

- **Recorded lineage from `pipeline_dag.json`.** `fleet run` never writes that file; only an
  explicit `PipelineDAG.generate()` does. The tree branch would have been empty in every
  real study.
- **`sanitize-html`.** The webview already refuses scripts; a Content-Security-Policy refuses
  everything else. Same guarantee, one dependency fewer.
- **Status bar item.** VS Code shows running tasks itself.
- **Modal confirmations and save prompts.** `task.saveBeforeRun` saves; the terminal shows
  the exact command; overwriting outputs is what `fleet run` is for.
- **Path-containment, symlink and size guards.** The extension reads the programmer's own
  study files, in a trusted workspace.
- **Per-command trust checks.** `untrustedWorkspaces.supported: false` already prevents
  activation.
- **"Show assistant configuration".** Replaced by the MCP server definition provider, which
  needs no JSON and no user action.

## Added

- Spec ↔ code navigation: hover and Go to Definition on quoted variable names in Python,
  code lenses on every dataset in `define.yaml`.
- Conformance findings from `fleet_dataset_check` as Problems on the spec lines concerned.
- Copilot integration through `vscode.lm.registerMcpServerDefinitionProvider` (engine floor
  raised to 1.101 for it).
- Output freshness on each dataset row, a report list, an offer to open reports after
  compare / validate / define-xml, a **New Study** bootstrap, and a program skeleton.

## Waits on Fleet

Proposed contracts, in the order they would unlock the most:

1. **Lineage written by `fleet run`** (`pipeline_dag.json` with `variables`). Unlocks the
   variable trace on hover: producing verb, sources, cross-domain joins.
2. **Dependency-closed `fleet run`** (topological order and upstream rebuild; Fleet #86).
   Until then the impact picker reruns what Fleet lists, in spec order.
3. **Structured `fleet validate` output** (`--format json`, as `compare` has). Unlocks
   validation findings as Problems, per variable.
4. **Inline ↔ spec conversion on the introspection surface** (`coverage_matrix`, AST walk,
   `to_spec_yaml`). Unlocks a preview-diff code action in both directions.
5. **A bounded dataset preview tool** (first _n_ rows with labels and decodes). Unlocks an
   in-editor grid; until then a parquet viewer extension is the companion.
