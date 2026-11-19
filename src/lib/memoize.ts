/**
 * Remembers the result for each combination of text arguments. Used for
 * `Intl` formatters, which are slow to build and are needed once per table
 * cell; there are only ever a handful of locale and currency combinations.
 */
export function memoize<Args extends string[], Result>(make: (...args: Args) => Result) {
  const made = new Map<string, Result>();
  return (...args: Args): Result => {
    const key = args.join("|");
    if (!made.has(key)) made.set(key, make(...args));
    return made.get(key) as Result;
  };
}
