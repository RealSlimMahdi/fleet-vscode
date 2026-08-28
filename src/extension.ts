// Fleet CDISC — VS Code shell around `fleet lsp --stdio`.
//
// The extension is a thin launcher: all semantic logic (diagnostics,
// completions, hover) lives in the Python language server shipped with
// the fleet-cdisc package (`lsp` extra).

import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";
import type { LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { LanguageClient } from "vscode-languageclient/node";

import { discoverServer } from "./server.ts";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const root = workspace.workspaceFolders?.[0]?.uri.fsPath;
  const server = discoverServer(root);

  const serverOptions: ServerOptions = {
    command: server.command,
    args: server.args,
    options: { cwd: root },
  };
  const clientOptions: LanguageClientOptions = {
    // The server only speaks define.yaml; scope to those files.
    documentSelector: [{ language: "yaml", pattern: "**/define*.yaml" }],
  };

  client = new LanguageClient("fleet-lsp", "Fleet CDISC", serverOptions, clientOptions);
  context.subscriptions.push(client);
  await client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
