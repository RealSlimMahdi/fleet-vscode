import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EXPECTED_ENTRY_COUNT, checkVsix } from "../scripts/vsix.ts";

const MANIFEST = {
  name: "fleet-vscode",
  publisher: "fleet-vscode",
  version: "0.1.0",
  main: "./out/extension.js",
  icon: "icon.png",
};

const ENTRIES = [
  "extension.vsixmanifest",
  "[Content_Types].xml",
  "extension/package.json",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/LICENSE.txt",
  "extension/icon.png",
  "extension/out/extension.js",
];

describe("checkVsix", () => {
  it("passes the shipped package", () => {
    assert.deepEqual(checkVsix(ENTRIES, MANIFEST), []);
  });

  it("counts the entries it expects", () => {
    assert.equal(ENTRIES.length, EXPECTED_ENTRY_COUNT);
  });

  it("names a missing listing file", () => {
    const problems = checkVsix(
      ENTRIES.filter((entry) => entry !== "extension/changelog.md"),
      MANIFEST,
    );

    assert.equal(problems.length, 2); // the file, and the count it changed
    assert.match(problems[0], /extension\/changelog\.md/);
  });

  it("rejects development content", () => {
    const problems = checkVsix([...ENTRIES, "extension/src/extension.ts"], MANIFEST);

    assert.ok(problems.some((problem) => /extension\/src\/extension\.ts/.test(problem)));
  });

  it("rejects the fixture study", () => {
    const problems = checkVsix(
      [...ENTRIES, "extension/fixture/metadata/sdtm/define.yaml"],
      MANIFEST,
    );

    assert.ok(problems.some((problem) => /fixture/.test(problem)));
  });

  it("rejects source maps", () => {
    const problems = checkVsix([...ENTRIES, "extension/out/extension.js.map"], MANIFEST);

    assert.ok(problems.some((problem) => /\.map/.test(problem)));
  });

  it("flags an entry count that drifted", () => {
    const problems = checkVsix([...ENTRIES, "extension/SUPPORT.md"], MANIFEST);

    assert.ok(problems.some((problem) => /9 entries, expected 8/.test(problem)));
  });

  it("requires the entry point named by the manifest to be packaged", () => {
    const problems = checkVsix(ENTRIES, { ...MANIFEST, main: "./out/missing.js" });

    assert.ok(problems.some((problem) => /out\/missing\.js/.test(problem)));
  });

  it("requires the icon named by the manifest to be packaged", () => {
    const problems = checkVsix(ENTRIES, { ...MANIFEST, icon: "logo.png" });

    assert.ok(problems.some((problem) => /logo\.png/.test(problem)));
  });

  it("requires the identity the Marketplace keys on", () => {
    const problems = checkVsix(ENTRIES, { ...MANIFEST, publisher: undefined });

    assert.ok(problems.some((problem) => /publisher/.test(problem)));
  });
});
