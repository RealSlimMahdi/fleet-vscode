# Changelog

All notable changes to this extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `fleet.server.path` setting, taking precedence over every other discovery step.
- `fleet.trace.server` setting and the **Fleet CDISC: Restart Language Server** command.
- Minimum Fleet version enforced from the `initialize` handshake: a lower major refuses,
  a lower minor warns, unrecognisable metadata is logged only, and newer is accepted.
- Actionable error notification, with **Show Log** and **Open Settings**, when the server
  is missing or fails to start.
- Unit tests (`npm run test:unit`) covering discovery precedence on POSIX and Windows
  layouts and the version contract.

### Changed

- `FLEET_LSP` now ranks below `fleet.server.path` and above the workspace virtualenv.

## [0.1.0] — extracted from RealSlimMahdi/fleet-cdisc

### Added

- Initial standalone release, extracted from the `editors/vscode/` subtree of
  [`RealSlimMahdi/fleet-cdisc`](https://github.com/RealSlimMahdi/fleet-cdisc)
  (Fleet commits `aa38aa0` and `b5f1bf5`).
- Diagnostics, completions, and hover for `define.yaml`, served by
  `fleet lsp --stdio` from the installed `fleet-cdisc` package.

[Unreleased]: https://github.com/RealSlimMahdi/fleet-vscode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RealSlimMahdi/fleet-vscode/releases/tag/v0.1.0
