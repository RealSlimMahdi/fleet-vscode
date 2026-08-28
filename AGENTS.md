# fleet-vscode — Agent Instructions

The VS Code client for [Fleet](https://github.com/RealSlimMahdi/fleet-cdisc). A thin
TypeScript launcher for the Python language server — **not** a place for clinical logic.

## Hard Rules

- **Package manager:** ALWAYS `npm`. NEVER pnpm or yarn.
- **Lint/format:** ESLint + Prettier. NEVER Biome. Type-aware rules are on; a floating
  promise is a bug, not a style nit.
- **Build:** esbuild bundles, `tsc --noEmit` type-checks. NEVER add an emit step.
- **Node ≥ 22.18** — unit tests run raw `.ts` through `node --test`.
- **The server lives in `fleet-cdisc`.** Never add algorithms, schema, or codelist knowledge
  here.

## Syntax constraints

`erasableSyntaxOnly` is on, because Node's type stripping cannot erase runtime-bearing
TypeScript:

- No `enum` (including `const enum`), no `namespace` with runtime code, no parameter
  properties.
- Relative imports carry the `.ts` extension.
- Prefer `import type` for type-only imports (`consistent-type-imports` enforces it).

## Layout

| Path               | Holds                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `src/extension.ts` | `activate` / `deactivate`, `LanguageClient` construction, error UX |
| `src/server.ts`    | `discoverServer()` — pure, exported, **no `vscode` import**        |
| `src/version.ts`   | Minimum-Fleet contract — pure, **no `vscode` import**              |
| `test/`            | `node --test` units over `src/server.ts` and `src/version.ts`      |

`src/server.ts` and `src/version.ts` staying free of `vscode` is what makes them
unit-testable outside the Extension Host. Keep it that way.

The `LanguageClient` id is `fleet` because `vscode-languageclient` reads
`<id>.trace.server`; renaming it silently breaks the `fleet.trace.server` setting.

## Verified Commands

```bash
npm ci
npm run check      # typecheck + lint + format:check + unit tests
npm run bundle
npm run package    # .vsix
```
