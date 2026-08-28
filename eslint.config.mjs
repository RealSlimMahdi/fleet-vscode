import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // esbuild.js is a CommonJS build script, outside the TypeScript program.
  { ignores: ["out/**", ".vscode-test/**", "esbuild.js"] },
  eslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
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
  prettier,
);
