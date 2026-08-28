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

A committed launch configuration and a bundled test fixture are not in place yet, so
running the extension currently means bundling it and launching an Extension Development
Host against a workspace of your own that contains a `define.yaml`.

## Commands

| Command             | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `npm run check`     | Type-check, lint, and format-check — the CI gate.            |
| `npm run typecheck` | `tsc --noEmit`. esbuild emits; TypeScript only checks types. |
| `npm run lint`      | ESLint with type-aware rules.                                |
| `npm run format`    | Rewrite with Prettier (`format:check` to verify only).       |
| `npm run bundle`    | Bundle `src/extension.ts` → `out/extension.js` with esbuild. |
| `npm run watch`     | Rebuild on change.                                           |
| `npm run package`   | Build a `.vsix` with `vsce`.                                 |

## Running against a Fleet study

The extension needs a workspace containing a `define.yaml` and a Fleet install carrying the
`lsp` extra. Point it at one of:

- any Fleet study checkout with `.venv/bin/fleet` present, or
- the `FLEET_LSP` environment variable, which is the escape hatch for a Fleet worktree.

## House rules

The binding rules live in [AGENTS.md](AGENTS.md) — npm only, esbuild bundles while `tsc`
only type-checks, no syntax `erasableSyntaxOnly` rejects, and no semantic logic in this
repository. The one worth repeating: `src/server.ts` must never import `vscode`, because
that is what keeps it testable outside the Extension Host.
