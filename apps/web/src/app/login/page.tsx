import { signIn } from "@/lib/auth";

/**
 * Holdsworth login page — Google OAuth only.
 *
 * Setup instructions:
 * 1. Create OAuth 2.0 credentials in Google Cloud Console
 * 2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local
 * 3. Generate AUTH_SECRET with: npx auth secret
 * 4. Add authorized redirect URI: http://localhost:3000/api/auth/callback/google
 */

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-h-black)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-burg-border)] bg-[var(--color-h-off-black)] p-8 shadow-xl">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[4px] border border-[var(--color-h-light)]">
            <span
              style={{ fontFamily: "var(--font-display)" }}
              className="text-3xl text-[var(--color-h-light)]"
            >
              H
            </span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl text-[var(--color-h-light)]"
          >
            Holdsworth
          </h1>
          <p
            style={{ fontFamily: "var(--font-body)" }}
            className="text-sm text-[var(--color-h-silver)]"
          >
            Card scanner &amp; collection manager
          </p>
        </div>

        {/* Sign in form (server action) */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--color-burg-border)] bg-[var(--color-burg)] px-4 py-3 text-sm font-medium text-[var(--color-h-white)] transition-colors hover:bg-[var(--color-burg-hover)]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        {/* Footer note */}
        <p
          style={{ fontFamily: "var(--font-mono)" }}
          className="mt-6 text-center text-[10px] tracking-[0.06em] text-[var(--color-h-graphite)]"
        >
          Single-user access
        </p>
      </div>
    </div>
  );
}
