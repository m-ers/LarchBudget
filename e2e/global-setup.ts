import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const standalone = path.join(".next", "standalone");
const server = path.join(standalone, "server.js");

/** When the newest file under a folder was last changed. */
function newestChange(dir: string): number {
  return Math.max(
    0,
    ...readdirSync(dir, { withFileTypes: true }).map((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? newestChange(file) : statSync(file).mtimeMs;
    }),
  );
}

/**
 * The tests run the production server from `.next/standalone`, the same way
 * the Docker image does. Like the Dockerfile, this puts the static files
 * next to it, because `next build` leaves them out.
 */
export default function globalSetup() {
  if (!existsSync(server)) {
    throw new Error("No production build found. Run `npm run build` first.");
  }
  if (newestChange("src") > statSync(server).mtimeMs) {
    throw new Error("The production build is older than `src`. Run `npm run build` again.");
  }
  cpSync(path.join(".next", "static"), path.join(standalone, ".next", "static"), {
    recursive: true,
  });
}
