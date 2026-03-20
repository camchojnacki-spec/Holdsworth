"use server";

import { db, notifications, cards, players, sets } from "@holdsworth/db";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ── Types ──

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string | null;
  cardId: string | null;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Get Notifications ──

export async function getNotifications(limit: number = 50): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      cardId: notifications.cardId,
      read: notifications.read,
      metadata: notifications.metadata,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    metadata: r.metadata as Record<string, unknown> | null,
  }));
}

// ── Get Unread Count ──

export async function getUnreadCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.read, false));

  return result?.count ?? 0;
}

// ── Mark as Read ──

export async function markAsRead(notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, notificationId));

  revalidatePath("/notifications");
}

// ── Mark All as Read ──

export async function markAllAsRead(): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.read, false));

  revalidatePath("/notifications");
}

// ── Delete Notification ──

export async function deleteNotification(notificationId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.id, notificationId));

  revalidatePath("/notifications");
}

// ── Delete All Read Notifications ──

export async function clearAllNotifications(): Promise<void> {
  await db.delete(notifications).where(eq(notifications.read, true));

  revalidatePath("/notifications");
}
