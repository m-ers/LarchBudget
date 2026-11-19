import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionIsValid } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (await sessionIsValid(request.cookies.get(SESSION_COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except Next.js build assets and the two tab icons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
