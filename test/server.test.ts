import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeSource, discoverServer } from "../src/server.ts";

const never = () => false;
const always = () => true;

describe("discoverServer", () => {
  it("prefers the configured server path over every other source", () => {
    const server = discoverServer({
      configuredPath: "/opt/fleet/bin/fleet",
      workspaceRoot: "/work/study",
      env: { FLEET_LSP: "/worktree/.venv/bin/fleet" },
      platform: "linux",
      exists: always,
    });

    assert.deepEqual(server, {
      command: "/opt/fleet/bin/fleet",
      args: ["lsp", "--stdio"],
      source: "setting",
    });
  });

  it("ignores a blank configured server path", () => {
    const server = discoverServer({
      configuredPath: "   ",
      workspaceRoot: "/work/study",
      platform: "linux",
      exists: always,
    });

    assert.equal(server.source, "workspace");
  });

  it("trims a configured server path", () => {
    const server = discoverServer({ configuredPath: "  /opt/fleet/bin/fleet  " });

    assert.equal(server.command, "/opt/fleet/bin/fleet");
  });

  it("uses FLEET_LSP ahead of the workspace environment", () => {
    const server = discoverServer({
      workspaceRoot: "/work/study",
      env: { FLEET_LSP: "/worktree/.venv/bin/fleet" },
      platform: "linux",
      exists: always,
    });

    assert.deepEqual(server, {
      command: "/worktree/.venv/bin/fleet",
      args: ["lsp", "--stdio"],
      source: "environment",
    });
  });

  it("finds the POSIX workspace virtual environment", () => {
    const server = discoverServer({
      workspaceRoot: "/work/study",
      platform: "darwin",
      env: {},
      exists: always,
    });

    assert.deepEqual(server, {
      command: "/work/study/.venv/bin/fleet",
      args: ["lsp", "--stdio"],
      source: "workspace",
    });
  });

  it("finds the Windows workspace virtual environment", () => {
    const server = discoverServer({
      workspaceRoot: "C:\\work\\study",
      platform: "win32",
      env: {},
      exists: always,
    });

    assert.deepEqual(server, {
      command: "C:\\work\\study\\.venv\\Scripts\\fleet.exe",
      args: ["lsp", "--stdio"],
      source: "workspace",
    });
  });

  it("falls back to the project runner when the workspace has no virtual environment", () => {
    const server = discoverServer({
      workspaceRoot: "/work/study",
      platform: "linux",
      env: {},
      exists: never,
    });

    assert.deepEqual(server, {
      command: "uv",
      args: ["run", "fleet", "lsp", "--stdio"],
      source: "runner",
    });
  });

  it("falls back to the project runner when there is no workspace", () => {
    const server = discoverServer({ platform: "win32", env: {}, exists: always });

    assert.equal(server.source, "runner");
    assert.deepEqual(server.args, ["run", "fleet", "lsp", "--stdio"]);
  });

  it("reads the environment and platform from the process by default", () => {
    const server = discoverServer();

    assert.equal(server.source, process.env.FLEET_LSP ? "environment" : "runner");
  });
});

describe("describeSource", () => {
  it("names what was tried, so a startup failure is actionable", () => {
    assert.match(describeSource("setting"), /fleet\.server\.path/);
    assert.match(describeSource("environment"), /FLEET_LSP/);
    assert.match(describeSource("workspace"), /virtual environment/);
    assert.match(describeSource("runner"), /uv run fleet/);
  });
});
