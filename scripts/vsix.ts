// What a shippable .vsix must and must not contain.
//
// `vsce` validates the manifest; nothing validates the archive. A stale
// `.vscodeignore` silently ships the fixture study or the TypeScript sources,
// and only a count catches a file nobody meant to add.

export interface VsixManifest {
  name?: string;
  publisher?: string;
  version?: string;
  main?: string;
  icon?: string;
}

/** Everything the Marketplace listing and the runtime need. */
const REQUIRED = [
  "extension.vsixmanifest",
  "[Content_Types].xml",
  "extension/package.json",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/LICENSE.txt",
  "extension/icon.png",
  "extension/out/extension.js",
];

/** A shipped VSIX is exactly {@link REQUIRED} — no more, no less. */
export const EXPECTED_ENTRY_COUNT = REQUIRED.length;

const FORBIDDEN: [RegExp, string][] = [
  [/^extension\/(src|test|integration|fixture|scripts)\//, "development source"],
  [/^extension\/(\.github|\.vscode)\//, "repository configuration"],
  [/^extension\/node_modules\//, "unbundled dependency"],
  [/\.map$/, "source map"],
  [/\.ts$/, "TypeScript source"],
];

/**
 * Report everything wrong with a packaged extension, worst first.
 *
 * @param entries Archive entry names, as stored in the `.vsix` zip.
 * @param manifest The `extension/package.json` read back out of the archive.
 */
export function checkVsix(entries: string[], manifest: VsixManifest): string[] {
  const present = new Set(entries);
  const problems: string[] = [];

  for (const entry of REQUIRED) {
    if (!present.has(entry)) {
      problems.push(`missing ${entry}`);
    }
  }

  for (const entry of entries) {
    const match = FORBIDDEN.find(([pattern]) => pattern.test(entry));
    if (match) {
      problems.push(`${entry} is ${match[1]} and must not ship`);
    }
  }

  for (const field of ["name", "publisher", "version"] as const) {
    if (!manifest[field]) {
      problems.push(`the packaged manifest has no ${field}`);
    }
  }

  for (const [field, value] of [
    ["main", manifest.main],
    ["icon", manifest.icon],
  ] as const) {
    if (value && !present.has(packaged(value))) {
      problems.push(`the manifest ${field} is ${value}, which is not in the archive`);
    }
  }

  if (entries.length !== EXPECTED_ENTRY_COUNT) {
    problems.push(`packaged ${entries.length} entries, expected ${EXPECTED_ENTRY_COUNT}`);
  }

  return problems;
}

function packaged(manifestPath: string): string {
  return `extension/${manifestPath.replace(/^\.\//, "")}`;
}
