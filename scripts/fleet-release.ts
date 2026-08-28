// The publication gate: fleet-cdisc must actually ship the language server.
//
// The extension is useless without `fleet lsp --stdio`, and the release on
// PyPI today predates it. Publishing before Fleet ships the `lsp` extra would
// put an extension on two Marketplaces that cannot start its own server.

import { MINIMUM_FLEET_VERSION, checkFleetVersion } from "../src/version.ts";

/** The `info` block of `https://pypi.org/pypi/fleet-cdisc/json`. */
export interface PypiInfo {
  version?: string;
  provides_extra?: string[];
}

export interface ReleaseVerdict {
  ok: boolean;
  message: string;
}

const EXTRA = "lsp";

/** Whether the newest `fleet-cdisc` on PyPI is one this extension can drive. */
export function checkFleetRelease(info: PypiInfo): ReleaseVerdict {
  const version = info.version;
  if (!version) {
    return { ok: false, message: "PyPI reported no fleet-cdisc version." };
  }

  if (!info.provides_extra?.includes(EXTRA)) {
    const extras = info.provides_extra?.join(", ") || "none";
    return {
      ok: false,
      message:
        `fleet-cdisc ${version} declares no '${EXTRA}' extra (has: ${extras}), ` +
        `so it carries no language server. Publication stays blocked until Fleet ships one.`,
    };
  }

  const verdict = checkFleetVersion(version);
  if (verdict.kind === "unsupported" || verdict.kind === "outdated") {
    return { ok: false, message: verdict.message };
  }

  return {
    ok: true,
    message: `fleet-cdisc ${version} ships the '${EXTRA}' extra and satisfies the announced minimum ${MINIMUM_FLEET_VERSION}.`,
  };
}
