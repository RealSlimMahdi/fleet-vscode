// Locating the Fleet language server.
//
// Never import `vscode` here: that is what keeps this module runnable under
// `node --test`, outside the Extension Host.

import * as fs from "node:fs";
import * as path from "node:path";

export interface ServerCommand {
  command: string;
  args: string[];
}

const SERVER_ARGS = ["lsp", "--stdio"];

/**
 * Resolve the `fleet` executable that should serve this workspace.
 *
 * Precedence: the `FLEET_LSP` override, then the workspace virtualenv,
 * then `uv run`, which resolves the project environment itself.
 */
export function discoverServer(workspaceRoot: string | undefined): ServerCommand {
  const override = process.env.FLEET_LSP;
  if (override) {
    return { command: override, args: SERVER_ARGS };
  }

  if (workspaceRoot) {
    const bin =
      process.platform === "win32"
        ? path.join(workspaceRoot, ".venv", "Scripts", "fleet.exe")
        : path.join(workspaceRoot, ".venv", "bin", "fleet");
    if (fs.existsSync(bin)) {
      return { command: bin, args: SERVER_ARGS };
    }
  }

  return { command: "uv", args: ["run", "fleet", ...SERVER_ARGS] };
}
