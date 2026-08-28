import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // esbuild.js is a CommonJS build script, outside the TypeScript program.
  { ignores: ["out/**", ".vscode-test/**", "esbuild.js"] },
  eslint.configs.recommended,
  {
    // Node-only ESM: config and generator scripts, never bundled.
    files: ["*.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "integration/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Node's type stripping needs `import type` erased at parse time.
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // `describe`/`it`/`test` return promises that the test runner, not us, awaits.
    files: ["test/**/*.ts", "integration/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
  prettier,
);
