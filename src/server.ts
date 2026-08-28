// Locating the Fleet language server.
//
// Never import `vscode` here: that is what keeps this module runnable under
// `node --test`, outside the Extension Host.

import * as fs from "node:fs";
import * as path from "node:path";

/** Which rung of the discovery ladder produced a {@link ServerCommand}. */
export type DiscoverySource = "setting" | "environment" | "workspace" | "runner";

export interface ServerCommand {
  command: string;
  args: string[];
  source: DiscoverySource;
}

export interface DiscoveryOptions {
  /** First workspace folder, when one is open. */
  workspaceRoot?: string;
  /** Value of the `fleet.server.path` setting. */
  configuredPath?: string;
  /** Injected so both layouts are exercised whatever the host platform is. */
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (candidate: string) => boolean;
}

const SERVER_ARGS = ["lsp", "--stdio"];

/** `uv` resolves the project environment itself, so no path is needed. */
const RUNNER_ARGS = ["run", "fleet"];

/**
 * Resolve the `fleet` executable that should serve this workspace.
 *
 * Precedence: the configured server path, the `FLEET_LSP` worktree escape
 * hatch, the workspace virtualenv, then the `uv run` project runner.
 */
export function discoverServer(options: DiscoveryOptions = {}): ServerCommand {
  const {
    workspaceRoot,
    configuredPath,
    platform = process.platform,
    env = process.env,
    exists = fs.existsSync,
  } = options;

  const configured = configuredPath?.trim();
  if (configured) {
    return { command: configured, args: [...SERVER_ARGS], source: "setting" };
  }

  const override = env.FLEET_LSP?.trim();
  if (override) {
    return { command: override, args: [...SERVER_ARGS], source: "environment" };
  }

  if (workspaceRoot) {
    const bin = venvExecutable(workspaceRoot, platform);
    if (exists(bin)) {
      return { command: bin, args: [...SERVER_ARGS], source: "workspace" };
    }
  }

  return { command: "uv", args: [...RUNNER_ARGS, ...SERVER_ARGS], source: "runner" };
}

function venvExecutable(workspaceRoot: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.win32.join(workspaceRoot, ".venv", "Scripts", "fleet.exe")
    : path.posix.join(workspaceRoot, ".venv", "bin", "fleet");
}

const SOURCE_LABELS: Record<DiscoverySource, string> = {
  setting: "the `fleet.server.path` setting",
  environment: "the `FLEET_LSP` environment variable",
  workspace: "the workspace virtual environment",
  runner: "`uv run fleet`",
};

/** Phrase naming *source*, so a startup failure says what was tried. */
export function describeSource(source: DiscoverySource): string {
  return SOURCE_LABELS[source];
}
