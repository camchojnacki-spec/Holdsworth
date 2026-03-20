"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";

interface HeaderProps {
  onMenuClick: () => void;
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

export function Header({ onMenuClick, notificationCount = 0, notifications = [] }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/85 backdrop-blur-xl px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <NotificationBell initialCount={notificationCount} initialNotifications={notifications} />
    </header>
  );
}
