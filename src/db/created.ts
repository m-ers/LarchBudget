/** Used by the tests and the demo-data script, where creating something is expected to succeed. */

/**
 * Unwraps the id from a create function that returns either an id or the
 * reason nothing was created, for code that expects creation to succeed.
 */
export function created(result: number | string): number {
  if (typeof result !== "number") throw new Error(`Not created: ${result}`);
  return result;
}
