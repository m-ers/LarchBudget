"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, safeEqual, sessionToken } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const { appPassword } = getConfig();
  if (!appPassword) redirect("/");

  const given = formData.get("password");
  if (typeof given !== "string" || !(await safeEqual(given, appPassword))) {
    return { error: "Wrong password." };
  }

  const isHttps = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, await sessionToken(appPassword), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
