/**
 * Runtime configuration from environment variables.
 *
 * Call this at request time only (after `await connection()` or inside a
 * Server Action), so values are not frozen into the build.
 */
export function getConfig() {
  return {
    /** When set, the app requires this password to log in. */
    appPassword: process.env.APP_PASSWORD || undefined,
  };
}
