# Fleet CDISC for VS Code

A study workbench for Fleet clinical programming: language support for `define.yaml`,
one-click dataset runs, QC comparison, validation, Define-XML, downstream impact, and
navigation between a program and the spec it implements.

The extension is a thin TypeScript client. All clinical meaning — algorithms, schema,
codelists, dependency graphs, conformance rules — comes from the installed
[`fleet-cdisc`](https://github.com/RealSlimMahdi/fleet-cdisc) package at runtime, through
`fleet lsp`, the `fleet` CLI and `fleet mcp`. Nothing is bundled, so a new Fleet capability
appears the moment it is installed.

## What it does

### In `define.yaml`

- **Diagnostics** — YAML syntax errors, JSON-schema violations from the generated define-spec
  schema, and did-you-mean hints for unknown `algorithm:` values.
- **Completions** — `algorithm:` ids per standard, per-algorithm parameter keys (required
  first), and codelist OIDs from the file's own `codelists:` section.
- **Hover** — algorithm summaries with the dispatched verb's docstring and parameter table;
  inline-codelist term previews.
- **Code lenses** — **Run**, **Compare with QC** and **Program** above every dataset.

### In a Python program

- Hover a quoted variable name such as `"TRTSDT"` to read its declaration from the spec,
  exactly as written.
- **Go to Definition** on it jumps to `define.yaml`. In `programs/sdtm/dm.py`, DM's
  declaration ranks first when several datasets declare the same name.

### The Fleet view

- Study → standard → dataset → variable, read from `study_config.yaml` and each
  `define.yaml`. Every row opens its source line.
- Each dataset shows its output — `dm.parquet · 2 h ago`, or _not built_ — and is
  highlighted when the output is older than the spec or the program. Modification times
  are a hint to rebuild, never proof of reproducibility.
- **Reports** lists what Fleet has written (comparison and validation reports, Define-XML
  previews, TLG output), newest first. HTML opens beside the editor with scripts disabled;
  **Open in Browser** shows the faithful rendering.

### Commands

From the palette, the view's buttons, the dataset context menu or the editor title of a
spec. Each runs the `fleet` CLI as a VS Code task in the study folder: cancellable, output
in the terminal, and customisable in `tasks.json`.

| Command                 | Runs                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Run Dataset…**        | `fleet run --dataset NAME`, or `fleet run` for every dataset                              |
| **Check Study**         | `fleet check`                                                                             |
| **Validate Datasets**   | `fleet validate [file] --report outputs/validation_<name>.html`, then offers the report   |
| **Compare with QC…**    | `fleet compare <qc> <output> --keys … --report …`; keys prefilled from the spec's `keys:` |
| **Generate Define-XML** | `fleet define-xml --standard sdtm\|adam`, then offers the HTML preview                    |
| **Environment Doctor**  | `fleet doctor` — also offered when the language server fails to start                     |
| **New Study…**          | Types `fleet new <id> …` into a terminal for you to adjust and run                        |

### Questions for Fleet

Read-only, answered by `fleet mcp --stdio` (the `mcp` extra); no dataset is executed.

- **What Changes Downstream?** — Fleet's rerun list for a dataset, preselected in a picker.
  Confirm to run exactly those datasets.
- **Show Execution Order** — the study's topological order; pick a dataset to open its
  declaration.
- **Check Dataset Against Spec** — Fleet's conformance findings (missing and extra columns,
  type mismatches, controlled-terminology values) as **Problems** on the spec lines they
  concern.

### Copilot

Each study's `fleet mcp --stdio` server is registered with VS Code's MCP support
automatically, so Copilot Chat can ask Fleet for execution order, lineage, validation and
codelist terms. Nothing leaves the machine unless you use chat, and nothing is written to
your settings.

## Requirements

The study needs Fleet installed; the `lsp` extra gives language support and the `mcp` extra
answers the dependency and conformance questions:

```bash
uv sync --extra lsp --extra mcp   # or: uv pip install 'fleet-cdisc[lsp,mcp]'
```

Validation needs the CDISC Rules Engine (`fleet install-engine`). **Environment Doctor**
reports what is installed; the extension never installs anything itself.

Workspace Trust is required: Fleet runs Python from your study. Nothing runs on save —
every run, comparison and generation is an explicit command.

The extension locates `fleet` in this order, for the language server and every command:

1. The `fleet.server.path` setting — a path to a `fleet` executable.
2. The `FLEET_LSP` environment variable — the escape hatch for a Fleet worktree.
3. `<study>/.venv/bin/fleet` (`.venv\Scripts\fleet.exe` on Windows).
4. `uv run fleet`, which resolves the project environment.

If none of them yields a working server, the extension says so with a notification rather
than going quiet.

Fleet **0.1.1 or newer** is required. An older major is refused, an older minor warns, and
an unrecognisable version — an editable development install, say — is logged and trusted.

## Settings and tasks

| Setting              | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `fleet.server.path`  | Explicit `fleet` executable; overrides discovery.  |
| `fleet.trace.server` | `off` \| `messages` \| `verbose` protocol tracing. |

**Fleet CDISC: Restart Language Server** restarts the server, picking up a changed
`fleet.server.path` or a reinstalled environment.

Every Fleet command is a task of type `fleet`, so **Tasks: Run Task** lists them and
`tasks.json` can add your own:

```json
{
  "type": "fleet",
  "command": "run",
  "args": ["--dataset", "ADSL", "--format", "xpt"],
  "label": "ADSL as XPT"
}
```

## Contributing

See [CONTRIBUTING.md](https://github.com/RealSlimMahdi/fleet-vscode/blob/main/CONTRIBUTING.md)
for the development loop, and [docs/workbench.md](docs/workbench.md) for why the workbench
looks the way it does and what waits on Fleet.

## Provenance

This repository was extracted from the `editors/vscode/` subtree of
[`RealSlimMahdi/fleet-cdisc`](https://github.com/RealSlimMahdi/fleet-cdisc), where the
extension lived until it was given its own release cadence. The relevant Fleet commits are
`aa38aa0` and `b5f1bf5`.

The history was deliberately **not** carried across: only two Fleet commits ever touched the
subtree and both were mixed commits describing unrelated work, so filtering would have
produced a single commit whose message documented something else. This repository therefore
starts from a fresh root commit, and the origin is recorded here and in
[CHANGELOG.md](CHANGELOG.md) instead.

## License

[MIT](https://github.com/RealSlimMahdi/fleet-vscode/blob/main/LICENSE)
