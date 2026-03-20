import type { Metadata } from "next";
import { auth, isAuthConfigured } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { getUnreadCount, getNotifications } from "@/actions/notifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holdsworth",
  description: "Scan, appraise, and manage your card collection",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isAuthConfigured ? await auth() : null;

  // Fetch notification data server-side for the bell icon
  let notificationCount = 0;
  let recentNotifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string | null;
    cardId: string | null;
    read: boolean;
    createdAt: string;
  }> = [];

  try {
    const [count, notifications] = await Promise.all([
      getUnreadCount(),
      getNotifications(10),
    ]);
    notificationCount = count;
    recentNotifications = notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
    }));
  } catch {
    // If DB is unavailable, render with empty notifications
  }

  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Karla:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8B2252" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <ServiceWorkerRegister />
        <AppShell
          user={session?.user ?? null}
          notificationCount={notificationCount}
          notifications={recentNotifications}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
