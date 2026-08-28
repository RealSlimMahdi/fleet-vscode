import { defineConfig } from "@vscode/test-cli";

// The fixture doubles as the Extension Host workspace: it is the only study a
// bare clone is guaranteed to have, and its define.yaml is what triggers the
// `workspaceContains` activation event under test.
export default defineConfig({
  files: "out/integration/**/*.test.js",
  workspaceFolder: "./fixture",
  launchArgs: ["--disable-extensions"],
  mocha: { timeout: 60_000 },
});
