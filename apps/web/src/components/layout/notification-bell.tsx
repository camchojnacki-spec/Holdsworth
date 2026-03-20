"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  cardId: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  initialCount: number;
  initialNotifications: Notification[];
}

export function NotificationBell({ initialCount, initialNotifications }: NotificationBellProps) {
  const [count, setCount] = useState(initialCount);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Poll for new notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { getUnreadCount, getNotifications } = await import("@/actions/notifications");
        const [newCount, newNotifications] = await Promise.all([
          getUnreadCount(),
          getNotifications(10),
        ]);
        setCount(newCount);
        setNotifications(
          newNotifications.map((n) => ({
            ...n,
            createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
          }))
        );
      } catch {
        // Silently ignore polling errors
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function handleMarkAsRead(notificationId: string) {
    startTransition(async () => {
      const { markAsRead } = await import("@/actions/notifications");
      await markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setCount((prev) => Math.max(0, prev - 1));
    });
  }

  async function handleMarkAllRead() {
    startTransition(async () => {
      const { markAllAsRead } = await import("@/actions/notifications");
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setCount(0);
    });
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function typeIcon(type: string): string {
    switch (type) {
      case "price_alert":
        return "\u25B2"; // triangle up
      case "system":
        return "\u2699"; // gear
      case "update":
        return "\u2605"; // star
      default:
        return "\u2022"; // bullet
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative text-muted-foreground hover:text-primary"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-burg)] px-1 text-[10px] font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-card shadow-xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3
              style={{ fontFamily: "var(--font-display)" }}
              className="text-sm font-semibold text-foreground"
            >
              Notifications
            </h3>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-[var(--color-burg-light)] hover:text-[var(--color-burg)] transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors",
                    !n.read && "bg-[var(--color-burg)]/5"
                  )}
                >
                  {/* Unread indicator */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!n.read ? (
                      <div className="h-2 w-2 rounded-full bg-[var(--color-burg)]" />
                    ) : (
                      <div className="h-2 w-2" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        <span className="mr-1.5 text-[var(--color-burg-light)]">{typeIcon(n.type)}</span>
                        {n.title}
                      </p>
                      <span
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="flex-shrink-0 text-[10px] text-muted-foreground"
                      >
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      {n.cardId && (
                        <Link
                          href={`/cards/${n.cardId}`}
                          onClick={() => setOpen(false)}
                          className="text-[11px] text-[var(--color-burg-light)] hover:underline"
                        >
                          View card
                        </Link>
                      )}
                      {!n.read && (
                        <button
                          onClick={() => handleMarkAsRead(n.id)}
                          disabled={isPending}
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs text-[var(--color-burg-light)] hover:text-[var(--color-burg)] transition-colors"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
