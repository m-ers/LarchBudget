/**
 * Optional single-password login.
 *
 * When APP_PASSWORD is unset the app is open (fine on your own machine).
 * When it is set, `src/proxy.ts` requires a session cookie on every request.
 * The cookie holds an HMAC derived from the password, so changing the
 * password logs out every existing session.
 */

export const SESSION_COOKIE = "larchbudget_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

/** The cookie value that proves a browser logged in with `password`. */
export function sessionToken(password: string): Promise<string> {
  return hmac(password, "larchbudget-session-v1");
}

/** True when `cookie` is the session cookie of someone who logged in with `password`. */
export async function sessionIsValid(
  cookie: string | undefined,
  password: string,
): Promise<boolean> {
  return Boolean(cookie) && safeEqual(cookie as string, await sessionToken(password));
}

/** Compares two strings without leaking where they differ through timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac("compare", a), hmac("compare", b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}
