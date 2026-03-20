import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * NextAuth v5 configuration for Holdsworth.
 *
 * Auth is OPTIONAL during development — if GOOGLE_CLIENT_ID is not set,
 * the middleware will skip authentication entirely so the app doesn't crash.
 *
 * Required env vars for production:
 *   GOOGLE_CLIENT_ID      — from Google Cloud Console OAuth 2.0
 *   GOOGLE_CLIENT_SECRET   — from Google Cloud Console OAuth 2.0
 *   AUTH_SECRET            — generate with: npx auth secret
 */

export const isAuthConfigured = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.AUTH_SECRET
);

// Only initialize NextAuth when fully configured — it crashes without AUTH_SECRET
const nextAuth = isAuthConfigured
  ? NextAuth({
      providers: [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ],
      pages: {
        signIn: "/login",
      },
      callbacks: {
        authorized: async ({ auth }) => {
          return !!auth;
        },
      },
    })
  : null;

// Export stubs when auth isn't configured so the rest of the app doesn't crash
export const handlers = nextAuth?.handlers ?? {
  GET: () => new Response("Auth not configured", { status: 404 }),
  POST: () => new Response("Auth not configured", { status: 404 }),
};

export const signIn = nextAuth?.signIn ?? (async () => {});
export const signOut = nextAuth?.signOut ?? (async () => {});
export const auth = nextAuth?.auth ?? (async () => null);
