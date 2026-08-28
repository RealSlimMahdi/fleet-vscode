// Extension Host coverage: the packaged client activates in a real VS Code for
// a workspace containing define.yaml. No Python server runs here — server
// startup is allowed to fail, and the extension must still come up.

import assert from "node:assert/strict";

import * as vscode from "vscode";

const EXTENSION_ID = "fleet-vscode.fleet-vscode";
const RESTART_COMMAND = "fleet.restartServer";

async function waitFor(condition: () => boolean, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

suite("Fleet CDISC activation", () => {
  test("activates itself for a workspace containing define.yaml", async () => {
    const specs = await vscode.workspace.findFiles("**/define.yaml");
    assert.ok(specs.length > 0, "the fixture workspace has no define.yaml to activate on");

    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed in the Extension Host`);

    // Not `activate()`: forcing it would prove nothing about the manifest.
    assert.ok(await waitFor(() => extension.isActive), "extension never activated on its own");
  });

  test("registers the restart command", async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes(RESTART_COMMAND), `${RESTART_COMMAND} is not registered`);
  });
});
