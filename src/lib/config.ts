const DEFAULT_CURRENCY = "EUR";
const DEFAULT_LOCALE = "en-US";

/** A usable ISO 4217 currency code, or the default when the setting is not one. */
export function resolveCurrency(setting: string | undefined): string {
  const code = (setting ?? "").trim().toUpperCase();
  if (code === "") return DEFAULT_CURRENCY;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return code;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/**
 * A usable BCP 47 locale, or the default when the setting is not one.
 * Accepts the underscore form system locales use ("nl_NL").
 */
export function resolveLocale(setting: string | undefined): string {
  const tag = (setting ?? "").trim().replace(/_/g, "-");
  if (tag === "") return DEFAULT_LOCALE;
  try {
    return Intl.NumberFormat.supportedLocalesOf(tag)[0] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

const warned = new Set<string>();

/** Says once in the server log that a setting was ignored. */
function warnIfIgnored(name: string, setting: string | undefined, used: string) {
  const given = (setting ?? "").trim();
  if (given === "" || warned.has(name)) return;
  if (given.replace(/_/g, "-").toLowerCase() !== used.toLowerCase()) {
    warned.add(name);
    console.warn(`LarchBudget: ${name}="${given}" is not valid, using "${used}" instead.`);
  }
}

/**
 * Runtime configuration from environment variables.
 *
 * Call this at request time only (after `await connection()` or inside a
 * Server Action), so values are not frozen into the build.
 */
export function getConfig() {
  const currency = resolveCurrency(process.env.CURRENCY);
  const locale = resolveLocale(process.env.LOCALE);
  warnIfIgnored("CURRENCY", process.env.CURRENCY, currency);
  warnIfIgnored("LOCALE", process.env.LOCALE, locale);

  return {
    /** ISO 4217 currency of the whole budget. */
    currency,
    /** BCP 47 locale used to format numbers and dates. */
    locale,
    /** When set, the app requires this password to log in. */
    appPassword: process.env.APP_PASSWORD || undefined,
  };
}
