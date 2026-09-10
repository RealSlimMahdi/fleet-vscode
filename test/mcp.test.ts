import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";

import { callTool, names } from "../src/mcp.ts";
import type { ServerCommand } from "../src/server.ts";

const server: ServerCommand = {
  command: process.execPath,
  args: ["--experimental-strip-types", path.resolve("test/support/mcp-server.ts")],
  source: "setting",
};

const call = (tool: string, args: Record<string, unknown>, command = server) =>
  callTool(command, process.cwd(), tool, args, AbortSignal.timeout(5000));

describe("callTool", () => {
  it("returns the structured result of an advertised tool", async () => {
    assert.deepEqual(names(await call("fleet_execution_order", { spec_paths: [] })), [
      "dm_raw",
      "DM",
      "ADSL",
    ]);
  });

  it("returns a dict result as-is", async () => {
    assert.deepEqual(await call("fleet_dataset_check", {}), {
      dataset: "DM",
      is_valid: false,
      missing_columns: ["AGE"],
    });
  });

  it("names a tool the installed Fleet does not provide", async () => {
    await assert.rejects(
      call("fleet_execution_order", {}, { ...server, args: [...server.args, "missing"] }),
      /does not provide fleet_execution_order/,
    );
  });

  it("falls back to parsed or plain text when there is no structured result", async () => {
    assert.deepEqual(await call("fleet_impacted_by", { node: "json" }), ["dm_raw", "DM", "ADSL"]);
    assert.equal(await call("fleet_impacted_by", { node: "legacy" }), "DM");
  });

  it("preserves Fleet's own error message", async () => {
    await assert.rejects(call("fleet_impacted_by", { node: "invalid" }), /Missing input: source/);
  });

  it("cancels a request that never answers", async () => {
    await assert.rejects(
      callTool(
        server,
        process.cwd(),
        "fleet_impacted_by",
        { node: "wait" },
        AbortSignal.timeout(500),
      ),
    );
  });
});

describe("names", () => {
  it("rejects anything but a list of names", () => {
    assert.throws(() => names({}), /unexpected result shape/);
    assert.throws(() => names([1]), /unexpected result shape/);
  });
});
