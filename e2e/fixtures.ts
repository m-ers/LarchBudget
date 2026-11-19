import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as base, expect } from "@playwright/test";

export { expect };

export type AppOptions = {
  /** Sets APP_PASSWORD, so every page asks for it. */
  password?: string;
  /** Fills the database with the demo data from `npm run db:seed` first. */
  seed?: boolean;
};

/** A port nothing listens on yet. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(url: string, server: ChildProcess, log: () => string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`The LarchBudget server did not start:\n${log()}`);
}

async function stop(server: ChildProcess) {
  if (server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
}

/**
 * `app` sets how the server starts; use `test.use({ app: { ... } })`.
 * Every test then gets:
 * - its own production server with an empty database, as `baseURL`;
 * - a check that the server logged no errors;
 * - a check that the page threw no errors.
 */
export const test = base.extend<{ app: AppOptions }>({
  app: [{}, { option: true }],

  baseURL: async ({ app }, use, testInfo) => {
    const dir = mkdtempSync(path.join(tmpdir(), "larchbudget-e2e-"));
    const port = await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_PATH: path.join(dir, "larchbudget.db"),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      CURRENCY: "EUR",
      LOCALE: "en-US",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    delete env.APP_PASSWORD;
    if (app.password) env.APP_PASSWORD = app.password;
    if (app.seed) {
      execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
        env,
        stdio: "pipe",
      });
    }

    let log = "";
    const server = spawn(process.execPath, [path.join(".next", "standalone", "server.js")], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk) => (log += chunk));
    server.stderr?.on("data", (chunk) => (log += chunk));

    const url = `http://127.0.0.1:${port}`;
    try {
      await waitUntilUp(url, server, () => log);
      await use(url);
    } finally {
      await stop(server);
      rmSync(dir, { recursive: true, force: true });
      await testInfo.attach("server.log", { body: log, contentType: "text/plain" });
    }
    // Next.js marks server errors with ⨯.
    expect(log, "the server logged an error").not.toMatch(/⨯|\bError\b/);
  },

  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "the page threw an error").toEqual([]);
  },
});
