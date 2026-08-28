// The Fleet compatibility contract.
//
// `fleet.introspect` and the LSP handshake are additive-only within a major
// version (fleet-cdisc ADR-0001), so the client declares a minimum and never
// a maximum. Never import `vscode` here: it must run under `node --test`.

/**
 * Oldest Fleet release carrying `fleet.introspect` and the `lsp` extra.
 *
 * The published `0.1.0` predates both. The contract compares major.minor only,
 * so this does not refuse it — `scripts/verify-fleet-release.ts` is what keeps
 * the extension off the Marketplaces until Fleet ships a usable release.
 */
export const MINIMUM_FLEET_VERSION = "0.1.1";

export type VersionVerdict =
  | { kind: "ok" }
  | { kind: "unknown"; message: string }
  | { kind: "outdated"; message: string }
  | { kind: "unsupported"; message: string };

const UPGRADE = "Upgrade with `uv sync --extra lsp` or `uv pip install -U 'fleet-cdisc[lsp]'`.";

/** Epoch, major and minor of a PEP 440 release segment. */
const RELEASE_RE = /^(?:(\d+)!)?(\d+)(?:\.(\d+))?/;

/**
 * Judge the Fleet version announced in the `initialize` handshake.
 *
 * A lower major is refused, a lower minor is a warning, and metadata that
 * carries no parsable release segment is logged and otherwise trusted —
 * editable development installs must stay usable.
 */
export function checkFleetVersion(
  reported: string | undefined,
  minimum: string = MINIMUM_FLEET_VERSION,
): VersionVerdict {
  const found = release(reported);
  if (!found) {
    return {
      kind: "unknown",
      message:
        `The language server announced no recognisable Fleet version ` +
        `(${reported ? `"${reported}"` : "none"}); skipping the compatibility check.`,
    };
  }

  const floor = release(minimum);
  if (!floor) {
    return { kind: "ok" };
  }

  const [epoch, major, minor] = found;
  const [minEpoch, minMajor, minMinor] = floor;

  if (epoch < minEpoch || (epoch === minEpoch && major < minMajor)) {
    return {
      kind: "unsupported",
      message:
        `Fleet ${reported} is too old for this extension, which needs ` +
        `${minimum} or newer. ${UPGRADE}`,
    };
  }
  if (epoch === minEpoch && major === minMajor && minor < minMinor) {
    return {
      kind: "outdated",
      message:
        `Fleet ${reported} predates the ${minimum} this extension targets, so some ` +
        `define.yaml features may be missing. ${UPGRADE}`,
    };
  }
  return { kind: "ok" };
}

function release(version: string | undefined): [number, number, number] | undefined {
  const match = version ? RELEASE_RE.exec(version) : null;
  return match ? [Number(match[1] ?? 0), Number(match[2]), Number(match[3] ?? 0)] : undefined;
}
