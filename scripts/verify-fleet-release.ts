// Release preflight: refuses to publish while fleet-cdisc has no `lsp` extra.
//
// Run through `npm run release:preflight`, first step of the release workflow.

import { checkFleetRelease, type PypiInfo } from "./fleet-release.ts";

const PYPI = "https://pypi.org/pypi/fleet-cdisc/json";

async function main(): Promise<void> {
  const response = await fetch(PYPI);
  if (!response.ok) {
    console.error(`${PYPI} returned ${response.status} ${response.statusText}.`);
    process.exit(1);
  }

  const { info } = (await response.json()) as { info: PypiInfo };
  const verdict = checkFleetRelease(info);

  console[verdict.ok ? "log" : "error"](verdict.message);
  process.exit(verdict.ok ? 0 : 1);
}

void main();
