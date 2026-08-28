import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MINIMUM_FLEET_VERSION, checkFleetVersion } from "../src/version.ts";

const MIN = "1.4.2";

describe("checkFleetVersion", () => {
  it("ships a minimum that is itself supported", () => {
    assert.equal(checkFleetVersion(MINIMUM_FLEET_VERSION).kind, "ok");
  });

  it("accepts the exact minimum", () => {
    assert.equal(checkFleetVersion("1.4.2", MIN).kind, "ok");
  });

  it("accepts a newer minor", () => {
    assert.equal(checkFleetVersion("1.5.0", MIN).kind, "ok");
  });

  it("accepts a newer major", () => {
    assert.equal(checkFleetVersion("2.0.0", MIN).kind, "ok");
  });

  it("accepts a newer epoch", () => {
    assert.equal(checkFleetVersion("1!1.0.0", MIN).kind, "ok");
  });

  it("ignores the patch segment", () => {
    assert.equal(checkFleetVersion("1.4.0", MIN).kind, "ok");
  });

  it("ignores pre-release, post-release and development suffixes", () => {
    assert.equal(checkFleetVersion("1.5.0rc1", MIN).kind, "ok");
    assert.equal(checkFleetVersion("1.5.0.post1", MIN).kind, "ok");
    assert.equal(checkFleetVersion("1.5.0.dev12+g1a2b3c4", MIN).kind, "ok");
  });

  it("warns on a lower minor", () => {
    const verdict = checkFleetVersion("1.3.9", MIN);

    assert.equal(verdict.kind, "outdated");
    assert.match(verdict.message, /1\.3\.9/);
    assert.match(verdict.message, /1\.4\.2/);
  });

  it("treats a missing minor as zero", () => {
    assert.equal(checkFleetVersion("1", MIN).kind, "outdated");
    assert.equal(checkFleetVersion("2", MIN).kind, "ok");
  });

  it("refuses a lower major", () => {
    const verdict = checkFleetVersion("0.9.9", MIN);

    assert.equal(verdict.kind, "unsupported");
    assert.match(verdict.message, /0\.9\.9/);
    assert.match(verdict.message, /1\.4\.2/);
  });

  it("logs only when the server reports no version", () => {
    assert.equal(checkFleetVersion(undefined, MIN).kind, "unknown");
    assert.equal(checkFleetVersion("", MIN).kind, "unknown");
  });

  it("logs only when the reported version is unparsable", () => {
    const verdict = checkFleetVersion("nightly", MIN);

    assert.equal(verdict.kind, "unknown");
    assert.match(verdict.message, /nightly/);
  });
});
