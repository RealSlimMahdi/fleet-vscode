const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  format: "cjs",
  platform: "node",
  // Oldest Electron runtime behind engines.vscode ^1.82.0.
  target: "node18",
  // Supplied by the Extension Host, never bundled.
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    return;
  }
  await esbuild.build(options);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
