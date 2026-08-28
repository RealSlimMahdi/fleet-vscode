import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkFleetRelease } from "../scripts/fleet-release.ts";

describe("checkFleetRelease", () => {
  it("blocks the release published today, which has no lsp extra", () => {
    const verdict = checkFleetRelease({
      version: "0.1.0",
      provides_extra: ["all", "dev", "docs", "io"],
    });

    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /lsp/);
  });

  it("clears a release carrying the extra", () => {
    const verdict = checkFleetRelease({
      version: "0.2.0",
      provides_extra: ["all", "dev", "docs", "io", "lsp", "mcp"],
    });

    assert.equal(verdict.ok, true);
    assert.match(verdict.message, /0\.2\.0/);
  });

  it("blocks a release older than the minimum the client announces", () => {
    const verdict = checkFleetRelease({ version: "0.0.9", provides_extra: ["lsp"] });

    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /0\.0\.9/);
  });

  it("blocks metadata that declares no extras at all", () => {
    const verdict = checkFleetRelease({ version: "0.2.0" });

    assert.equal(verdict.ok, false);
  });
});
