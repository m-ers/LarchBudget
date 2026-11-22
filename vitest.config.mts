import { defineConfig } from "vitest/config";

// "@/…" resolves as in tsconfig.json, so code the page shares with the unit tests can use it.
export default defineConfig({ resolve: { tsconfigPaths: true } });
