import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const standalone = path.join(".next", "standalone");

/**
 * The tests run the production server from `.next/standalone`, the same way
 * the Docker image does. Like the Dockerfile, this puts the static files
 * next to it, because `next build` leaves them out.
 */
export default function globalSetup() {
  if (!existsSync(path.join(standalone, "server.js"))) {
    throw new Error("No production build found. Run `npm run build` first.");
  }
  cpSync(path.join(".next", "static"), path.join(standalone, ".next", "static"), {
    recursive: true,
  });
}
