import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for Holdsworth.
 *
 * When auth is configured (AUTH_SECRET + Google OAuth credentials set),
 * protects all routes except public ones.
 *
 * When auth is NOT configured (dev mode), all requests pass through.
 */

const isAuthConfigured = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.AUTH_SECRET
);

export async function middleware(request: NextRequest) {
  // Auth not configured — allow everything (dev mode)
  if (!isAuthConfigured) {
    return NextResponse.next();
  }

  // Dynamic import to avoid NextAuth crash when AUTH_SECRET is missing
  const { auth } = await import("@/lib/auth");
  const session = await (auth as () => Promise<unknown>)();

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon|icons|manifest|sw).*)",
  ],
};
