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
  /** Sets LOCALE, for how numbers and dates are written; en-US when not given. */
  locale?: string;
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

export type Server = { url: string; log: () => string; stop: () => Promise<void> };

/**
 * Starts the production server on a free port. It counts as started only
 * when its own log says so, never because something answers on the port:
 * another test's server may have taken the port in the meantime, and then
 * this tries again on a new one.
 */
async function startServer(env: NodeJS.ProcessEnv): Promise<Server> {
  let lastLog = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await freePort();
    let log = "";
    const child: ChildProcess = spawn(
      process.execPath,
      [path.join(".next", "standalone", "server.js")],
      { env: { ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout?.on("data", (chunk) => (log += chunk));
    child.stderr?.on("data", (chunk) => (log += chunk));
    // Settles on any ending: a normal exit, a signal, or a failure to start.
    const ended = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.once("error", (error) => {
        log += String(error);
        resolve();
      });
    });
    let hasEnded = false;
    void ended.then(() => (hasEnded = true));
    const stop = async () => {
      if (!hasEnded) child.kill();
      await ended;
    };

    const deadline = Date.now() + 20_000;
    while (!hasEnded && Date.now() < deadline && !/Ready in/.test(log)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!hasEnded && /Ready in/.test(log)) {
      return { url: `http://127.0.0.1:${port}`, log: () => log, stop };
    }
    await stop();
    lastLog = log;
    if (!/EADDRINUSE/.test(log)) break;
  }
  throw new Error(`The LarchBudget server did not start:\n${lastLog}`);
}

/**
 * `app` sets how the server starts; use `test.use({ app: { ... } })`.
 * Every test then gets:
 * - its own production server with an empty database, as `server` and
 *   `baseURL` (a test can stop it with `server.stop()`);
 * - a check that the server logged no errors;
 * - a check that the page threw no errors.
 */
export const test = base.extend<{ app: AppOptions; server: Server }>({
  app: [{}, { option: true }],

  server: async ({ app }, use, testInfo) => {
    const dir = mkdtempSync(path.join(tmpdir(), "larchbudget-e2e-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_PATH: path.join(dir, "larchbudget.db"),
      HOSTNAME: "127.0.0.1",
      CURRENCY: "EUR",
      LOCALE: app.locale ?? "en-US",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    delete env.APP_PASSWORD;
    if (app.password) env.APP_PASSWORD = app.password;

    let log = "";
    try {
      if (app.seed) {
        execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
          env,
          stdio: "pipe",
        });
      }
      const server = await startServer(env);
      try {
        await use(server);
      } finally {
        await server.stop();
        log = server.log();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await testInfo.attach("server.log", { body: log, contentType: "text/plain" });
    }
    // Next.js marks server errors with ⨯.
    expect(log, "the server logged an error").not.toMatch(/⨯|\bError\b/);
  },

  baseURL: async ({ server }, use) => {
    await use(server.url);
  },

  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors, "the page threw an error").toEqual([]);
  },
});
