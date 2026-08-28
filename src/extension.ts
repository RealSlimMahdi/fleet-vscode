// Fleet CDISC — VS Code shell around `fleet lsp --stdio`.
//
// The extension is a thin launcher: all semantic logic (diagnostics,
// completions, hover) lives in the Python language server shipped with
// the fleet-cdisc package (`lsp` extra).

import type { ExtensionContext, OutputChannel } from "vscode";
import { commands, window, workspace } from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";

import type { ServerCommand } from "./server.ts";
import { describeSource, discoverServer } from "./server.ts";
import { checkFleetVersion } from "./version.ts";

// vscode-languageclient reads `<id>.trace.server`, so the client id has to
// be the settings section for `fleet.trace.server` to reach it.
const SECTION = "fleet";
const RESTART_COMMAND = "fleet.restartServer";

const SHOW_LOG = "Show Log";
const OPEN_SETTINGS = "Open Settings";

let client: LanguageClient | undefined;
let channel: OutputChannel | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // Owned by the extension rather than the client, so it survives restarts
  // and still holds the reason when the server never came up.
  channel = window.createOutputChannel("Fleet CDISC");
  context.subscriptions.push(
    channel,
    commands.registerCommand(RESTART_COMMAND, async () => {
      await stop();
      await start();
    }),
  );
  await start();
}

export async function deactivate(): Promise<void> {
  await stop();
}

async function start(): Promise<void> {
  const root = workspace.workspaceFolders?.[0]?.uri.fsPath;
  const server = discoverServer({
    workspaceRoot: root,
    configuredPath: workspace.getConfiguration(SECTION).get<string>("server.path"),
  });
  log(`Starting Fleet from ${describeSource(server.source)}: ${commandLine(server)}`);

  const serverOptions: ServerOptions = {
    command: server.command,
    args: server.args,
    options: { cwd: root },
  };
  const clientOptions: LanguageClientOptions = {
    // The server only speaks define.yaml; scope to those files.
    documentSelector: [{ language: "yaml", pattern: "**/define*.yaml" }],
    outputChannel: channel,
  };

  const newClient = new LanguageClient(SECTION, "Fleet CDISC", serverOptions, clientOptions);
  client = newClient;
  try {
    await newClient.start();
  } catch (error) {
    client = undefined;
    reportStartFailure(server, error);
    return;
  }
  await enforceVersion(newClient);
}

async function stop(): Promise<void> {
  const running = client;
  client = undefined;
  if (running?.isRunning()) {
    await running.dispose();
  }
}

/**
 * Apply the Fleet compatibility contract to the `initialize` handshake.
 *
 * A refused server is stopped rather than left half-usable; a merely old
 * one keeps serving behind a warning.
 */
async function enforceVersion(running: LanguageClient): Promise<void> {
  const verdict = checkFleetVersion(running.initializeResult?.serverInfo?.version);
  if (verdict.kind === "ok") {
    return;
  }
  log(verdict.message);
  if (verdict.kind === "outdated") {
    void window.showWarningMessage(verdict.message);
  } else if (verdict.kind === "unsupported") {
    await stop();
    void showError(verdict.message);
  }
}

function reportStartFailure(server: ServerCommand, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  log(`Failed to start ${commandLine(server)}: ${reason}`);
  void showError(
    `Fleet language server failed to start from ${describeSource(server.source)}. ` +
      `Check that Fleet is installed with the \`lsp\` extra. (${reason})`,
  );
}

async function showError(message: string): Promise<void> {
  const choice = await window.showErrorMessage(message, SHOW_LOG, OPEN_SETTINGS);
  if (choice === SHOW_LOG) {
    channel?.show();
  } else if (choice === OPEN_SETTINGS) {
    await commands.executeCommand("workbench.action.openSettings", `${SECTION}.server.path`);
  }
}

function commandLine(server: ServerCommand): string {
  return [server.command, ...server.args].join(" ");
}

function log(message: string): void {
  channel?.appendLine(message);
}
