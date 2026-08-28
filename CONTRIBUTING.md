# Contributing

## Requirements

- **Node ≥ 22.18.0** (see `.nvmrc`). Unit tests run raw `.ts` through `node --test`, which
  needs the type stripping that became default in 22.18. Below that floor they fail outright.
- **npm** — never pnpm or yarn.
- VS Code ≥ 1.82.

## Getting started

```bash
git clone https://github.com/RealSlimMahdi/fleet-vscode
cd fleet-vscode
npm ci
npm run check
```

Then press <kbd>F5</kbd> and pick **Run Extension (fixture)**. That launch configuration
needs nothing but the clone: it opens the committed `fixture/` study in an Extension
Development Host, which is enough to see the extension activate.

## Commands

| Command                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `npm run check`            | Type-check, lint, format-check, unit tests — the CI gate.    |
| `npm run typecheck`        | `tsc --noEmit`. esbuild emits; TypeScript only checks types. |
| `npm run lint`             | ESLint with type-aware rules.                                |
| `npm run format`           | Rewrite with Prettier (`format:check` to verify only).       |
| `npm run test:unit`        | `node --test` over `test/**/*.test.ts`, no Extension Host.   |
| `npm run test:integration` | Extension Host activation test against `fixture/`.           |
| `npm run fixture`          | Regenerate `fixture/` from the canonical study.              |
| `npm run bundle`           | Bundle `src/extension.ts` → `out/extension.js` with esbuild. |
| `npm run watch`            | Rebuild on change.                                           |
| `npm run package`          | Build a `.vsix` with `vsce`.                                 |

## The fixture

`fixture/metadata/sdtm/define.yaml` is **generated, never hand-edited**. `npm run fixture`
slices it out of the canonical study — the sibling `../test-study` by default, or whatever
`FLEET_STUDY` points at — keeping three codelists and the first six variables of the first
domain.

Because the slice is faithful, the fixture carries the canonical study's own schema
problems: two `origin: CRF` values outside the Define-XML enumeration and two blocks with
unexpected `cosmos` properties. Those four diagnostics lighting up is the fastest proof
that the language server is running.

## Running against a Fleet study

The second launch configuration, **Run Extension (../test-study)**, opens the sibling study
checkout. Unlike the fixture it expects a real Fleet install carrying the `lsp` extra, so it
is the one that exercises diagnostics, completions and hover against a live server.

The extension needs a workspace containing a `define.yaml` and a Fleet install carrying the
`lsp` extra. Point it at one of:

- the `fleet.server.path` setting, which wins over everything else,
- the `FLEET_LSP` environment variable, which is the escape hatch for a Fleet worktree,
- any Fleet study checkout with `.venv/bin/fleet` present, or
- a `uv` project, where `uv run fleet` resolves the environment.

Set `fleet.trace.server` to `verbose` and run **Fleet CDISC: Restart Language Server** to
watch the protocol traffic in the _Fleet CDISC_ output channel.

## What each launch target gives you

Recorded against `fleet-cdisc` 0.1.1 on macOS. A target is verified when the server starts,
diagnostics arrive, and typing `algorithm:` under a `derivation:` block offers the
standard's algorithms with hover documentation.

| Target          | Server                      | Diagnostics | `algorithm:` completions | Hover                    |
| --------------- | --------------------------- | ----------- | ------------------------ | ------------------------ |
| `fixture`       | `fleet.server.path`         | 4           | 16 SDTM algorithms       | summary + parameter list |
| `../test-study` | workspace `.venv/bin/fleet` | 145         | 30 ADaM algorithms       | summary + parameter list |

The fixture has no Python project of its own, so a bare clone gets activation but no live
server until you set `fleet.server.path` (or export `FLEET_LSP`). `../test-study` needs
nothing: its own `.venv` is discovered.

## House rules

The binding rules live in [AGENTS.md](AGENTS.md) — npm only, esbuild bundles while `tsc`
only type-checks, no syntax `erasableSyntaxOnly` rejects, and no semantic logic in this
repository. The one worth repeating: `src/server.ts` must never import `vscode`, because
that is what keeps it testable outside the Extension Host.
