# Changelog

All notable changes to this extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Study workbench.** A Fleet view (study → standard → dataset → variable, plus reports)
  reading `study_config.yaml` and each `define.yaml`; every row opens its source line and
  each dataset shows its output and whether it is older than the spec or the program.
- **Fleet commands as tasks** (`type: "fleet"`, listed in _Run Task_, extensible from
  `tasks.json`): Run Dataset, Check Study, Validate Datasets, Compare with QC (keys
  prefilled from the spec), Generate Define-XML, Environment Doctor, New Study.
- **Spec ↔ code navigation**: hover and Go to Definition on quoted variable names in Python
  programs; Run / Compare / Program code lenses on every dataset in `define.yaml`.
- **Questions for Fleet over `fleet mcp --stdio`**: What Changes Downstream? (rerun exactly
  the datasets Fleet lists), Show Execution Order, and Check Dataset Against Spec with the
  findings as Problems on the spec lines concerned.
- **Spec ↔ code**: Push Derivations to Spec writes Fleet's reverse-mapped `derivation:`
  blocks into the right stanzas of `define.yaml`; Generate Program from Spec renders a
  dataset's derivations as an inline chain (both static, via Fleet's new
  `fleet_code_to_spec` / `fleet_spec_to_code` tools).
- **Copilot**: each study's MCP server registered through VS Code's MCP provider API.
- Script-free HTML report preview beside the editor, with Open in Browser for the faithful
  rendering; reports offered as soon as a comparison, validation or Define-XML task ends.
- **Run Doctor** offered when the language server fails to start.
- `fleet.server.path` setting, taking precedence over every other discovery step.
- `fleet.trace.server` setting and the **Fleet CDISC: Restart Language Server** command.
- Minimum Fleet version enforced from the `initialize` handshake: a lower major refuses,
  a lower minor warns, unrecognisable metadata is logged only, and newer is accepted.
- Actionable error notification, with **Show Log** and **Open Settings**, when the server
  is missing or fails to start.
- Unit tests (`npm run test:unit`) covering discovery precedence on POSIX and Windows
  layouts and the version contract.
- Committed `fixture/` study, generated from the canonical study by `npm run fixture`,
  so a bare clone has something to launch against.
- Two launch configurations: **Run Extension (fixture)** and
  **Run Extension (../test-study)**.
- Extension Host activation test (`npm run test:integration`) against the fixture.
- CI: type-check, lint, format-check and unit tests on Ubuntu, macOS and Windows, plus
  the Extension Host test on Ubuntu.
- Packaging check (`npm run package`) asserting the VSIX contents and metadata, uploaded
  as an artifact on every pull request.
- Manual, protected release workflow publishing one verified VSIX to the VS Code
  Marketplace and Open VSX through OIDC trusted publishing — no stored registry tokens.
- Release preflight (`npm run release:preflight`) blocking publication until `fleet-cdisc`
  on PyPI ships the `lsp` extra.
- Marketplace listing metadata: keywords, gallery banner, pricing, homepage and Q&A links.

### Changed

- Minimum VS Code raised to 1.101, the first release with the MCP server definition API.
- The committed fixture now carries a `study_config.yaml` and a `programs/sdtm/` program,
  so the Extension Host tests cover the workbench.
- `FLEET_LSP` now ranks below `fleet.server.path` and above the workspace virtualenv.
- Minimum Fleet raised to `0.1.1`; the published `0.1.0` carries no language server.

## [0.1.0] — extracted from RealSlimMahdi/fleet-cdisc

### Added

- Initial standalone release, extracted from the `editors/vscode/` subtree of
  [`RealSlimMahdi/fleet-cdisc`](https://github.com/RealSlimMahdi/fleet-cdisc)
  (Fleet commits `aa38aa0` and `b5f1bf5`).
- Diagnostics, completions, and hover for `define.yaml`, served by
  `fleet lsp --stdio` from the installed `fleet-cdisc` package.

[Unreleased]: https://github.com/RealSlimMahdi/fleet-vscode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RealSlimMahdi/fleet-vscode/releases/tag/v0.1.0
