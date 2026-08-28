// Inspects a packaged .vsix and fails loudly when it is not shippable.
//
// Run through `npm run package`. Give it a path, or let it find the single
// .vsix in the repository root.

import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { open, type Entry } from "yauzl";

import { checkVsix, type VsixManifest } from "./vsix.ts";

interface Archive {
  entries: string[];
  manifest: VsixManifest;
}

function locate(): string {
  const given = process.argv[2];
  if (given) {
    return resolve(given);
  }
  const found = readdirSync(process.cwd()).filter((name) => name.endsWith(".vsix"));
  if (found.length !== 1) {
    throw new Error(`Expected exactly one .vsix in ${process.cwd()}, found ${found.length}.`);
  }
  return resolve(found[0]);
}

function read(path: string): Promise<Archive> {
  return new Promise((fulfil, reject) => {
    open(path, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }
      const entries: string[] = [];
      let manifest: VsixManifest = {};

      zip.on("error", reject);
      zip.on("end", () => fulfil({ entries, manifest }));
      zip.on("entry", (entry: Entry) => {
        entries.push(entry.fileName);
        if (entry.fileName !== "extension/package.json") {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            manifest = JSON.parse(Buffer.concat(chunks).toString("utf8")) as VsixManifest;
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function main(): Promise<void> {
  const path = locate();
  const { entries, manifest } = await read(path);
  const problems = checkVsix(entries, manifest);

  if (problems.length > 0) {
    console.error(`${path} is not shippable:`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }

  console.log(
    `${path} is shippable: ${manifest.publisher}.${manifest.name} ` +
      `${manifest.version}, ${entries.length} entries.`,
  );
}

void main();
