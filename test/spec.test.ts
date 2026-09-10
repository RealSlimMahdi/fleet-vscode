import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { age, parseSpec, parseStudy, standards } from "../src/spec.ts";

describe("parseStudy", () => {
  it("applies Fleet's defaults under the configured paths", () => {
    const config = parseStudy(
      "study_id: trial\npaths:\n  metadata_sdtm: meta/sdtm\n  unknown: 42\n",
    );

    assert.equal(config.id, "trial");
    assert.equal(config.paths.metadata_sdtm, "meta/sdtm");
    assert.equal(config.paths.sdtm_data, "data/sdtm");
    assert.equal(config.paths.outputs, "outputs");
    assert.equal("unknown" in config.paths, false);
  });

  it("still yields a usable study from an empty config", () => {
    assert.equal(parseStudy("").paths.metadata_adam, "metadata/adam");
  });

  it("reports malformed YAML instead of hiding it", () => {
    assert.throws(() => parseStudy("paths: ["));
  });
});

const SPEC = `datasets:
  - name: DM
    label: Demographics
    keys: [STUDYID, USUBJID]
    variables:
      - name: USUBJID
        label: Unique Subject Identifier
        type: text
      - name: RFSTDTC
        derivation:
          algorithm: date
          source: first_dose
  - name: AE
    variables: []
`;

describe("parseSpec", () => {
  it("locates datasets and variables in the original document", () => {
    const [dm, ae] = parseSpec(SPEC);

    assert.equal(dm.name, "DM");
    assert.equal(dm.label, "Demographics");
    assert.deepEqual(dm.keys, ["STUDYID", "USUBJID"]);
    assert.equal(dm.line, 1);
    assert.deepEqual(
      dm.variables.map((variable) => [variable.name, variable.label, variable.line]),
      [
        ["USUBJID", "Unique Subject Identifier", 5],
        ["RFSTDTC", undefined, 8],
      ],
    );
    assert.deepEqual(ae, { name: "AE", label: undefined, keys: [], line: 12, variables: [] });
  });

  it("keeps each variable's block as written, dedented for display", () => {
    const [dm] = parseSpec(SPEC);

    assert.equal(
      dm.variables[1].stanza,
      "name: RFSTDTC\nderivation:\n  algorithm: date\n  source: first_dose",
    );
  });

  it("ignores entries without a name and files without datasets", () => {
    assert.deepEqual(parseSpec("datasets:\n  - label: nameless\n"), []);
    assert.deepEqual(parseSpec("study:\n  id: x\n"), []);
  });

  it("reports malformed YAML instead of hiding it", () => {
    assert.throws(() => parseSpec("datasets: ["));
  });
});

describe("standards", () => {
  it("derives each standard from its metadata folder", () => {
    const config = parseStudy("paths:\n  metadata_send: meta/send\n  send_data: out/send\n");

    assert.deepEqual(
      standards(config).map((standard) => [
        standard.id,
        standard.metadata,
        standard.data,
        standard.programs,
      ]),
      [
        ["sdtm", "metadata/sdtm", "data/sdtm", "programs/sdtm"],
        ["adam", "metadata/adam", "data/adam", "programs/adam"],
        ["send", "meta/send", "out/send", undefined],
      ],
    );
  });
});

describe("age", () => {
  it("rounds to the unit a programmer glances at", () => {
    const now = 10 * 24 * 3_600_000;
    assert.equal(age(now, now), "just now");
    assert.equal(age(now - 5 * 60_000, now), "5 min ago");
    assert.equal(age(now - 3 * 3_600_000, now), "3 h ago");
    assert.equal(age(now - 2 * 24 * 3_600_000, now), "2 d ago");
  });
});
