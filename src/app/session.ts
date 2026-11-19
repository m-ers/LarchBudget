import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionIsValid } from "@/lib/auth";
import { getConfig } from "@/lib/config";

/** Whether this installation asks for a password at all. */
export function passwordIsSet(): boolean {
  return getConfig().appPassword !== undefined;
}

/** True when no password is set, or the visitor has a valid session cookie. */
export async function isLoggedIn(): Promise<boolean> {
  const { appPassword } = getConfig();
  if (!appPassword) return true;
  return sessionIsValid((await cookies()).get(SESSION_COOKIE)?.value, appPassword);
}

/** For pages: sends a visitor without a session to the login page. */
export async function requireLogin(): Promise<void> {
  if (!(await isLoggedIn())) redirect("/login");
}
