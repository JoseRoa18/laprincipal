import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Next.js 16 proxy (replaces middleware): redirects anonymous visitors to
 * /login and logged-in users away from /login.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);
  const isLoginPage = pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (isLoggedIn && (isLoginPage || pathname === "/")) {
    return NextResponse.redirect(new URL("/inicio", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // api/cron authenticates with a Bearer secret; api/files handles its own auth (public photos, signed documents).
    "/((?!api/auth|api/cron|api/files|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
