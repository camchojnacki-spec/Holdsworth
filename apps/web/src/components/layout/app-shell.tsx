"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { InstallPrompt } from "../pwa/install-prompt";

interface AppShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  notificationCount?: number;
  notifications?: Array<{
    id: string;
    type: string;
    title: string;
    message: string | null;
    cardId: string | null;
    read: boolean;
    createdAt: string;
  }>;
}

export function AppShell({ children, user, notificationCount = 0, notifications = [] }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          notificationCount={notificationCount}
          notifications={notifications}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
      <InstallPrompt />
    </div>
  );
}
