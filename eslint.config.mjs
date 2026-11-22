import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test output, and local files that are not part of the project.
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".claude/**",
  ]),
  {
    // Playwright fixtures pass a `use` callback, which is not React's `use` hook.
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // src/lib and src/db hold the rules and are unit tested without Next.js.
    files: ["src/lib/**", "src/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "@/app/*", "@/components/*"],
              message:
                "src/lib and src/db stay free of the framework so they can be unit tested. Next.js code belongs in src/app.",
            },
          ],
        },
      ],
    },
  },
  {
    // Components read through src/app/queries and change through src/app/actions.
    // Their unit tests may use a database, to check what the page shows
    // before a change is saved against what the server then has.
    files: ["src/components/**"],
    ignores: ["src/components/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/db", "@/db/*"],
              allowTypeImports: true,
              message:
                "Components may import types from src/db, but not its code: read through src/app/queries and change through src/app/actions.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
