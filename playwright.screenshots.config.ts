import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Takes the pictures for the README and the docs: `npm run screenshots`,
 * after `npm run build`. See `e2e/readme.shots.ts`.
 */
export default defineConfig({
  ...base,
  testMatch: "**/*.shots.ts",
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "screenshots",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1200, height: 760 },
        // Twice the pixels, so the pictures stay sharp on a high-resolution screen.
        deviceScaleFactor: 2,
      },
    },
  ],
});
