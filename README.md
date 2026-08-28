# Fleet CDISC for VS Code

Language support for Fleet `define.yaml` specifications.

The extension is a thin TypeScript client around the Python language server shipped with the
[`fleet-cdisc`](https://github.com/RealSlimMahdi/fleet-cdisc) package (`fleet lsp --stdio`).
All semantic knowledge — algorithms, schema, codelists — is discovered from the installed
Fleet package at runtime, never bundled, so new algorithms appear the moment they are
registered.

## Features

- **Diagnostics** — YAML syntax errors, JSON-schema violations from the generated define-spec
  schema, and did-you-mean hints for unknown `algorithm:` values.
- **Completions** — `algorithm:` ids per standard, per-algorithm parameter keys (required
  first), and codelist OIDs from the file's own `codelists:` section.
- **Hover** — algorithm summaries with the dispatched verb's docstring and parameter table;
  inline-codelist term previews.

## Requirements

The workspace needs Fleet installed with the `lsp` extra:

```bash
uv sync --extra lsp        # or: uv pip install 'fleet-cdisc[lsp]'
```

The extension locates the server in this order:

1. The `FLEET_LSP` environment variable — an absolute path to a `fleet` executable.
2. `<workspace>/.venv/bin/fleet` (`.venv\Scripts\fleet.exe` on Windows).
3. `uv run fleet`, which resolves the project environment.

## Contributing

See [CONTRIBUTING.md](https://github.com/RealSlimMahdi/fleet-vscode/blob/main/CONTRIBUTING.md)
for the development loop.

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
