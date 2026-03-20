"use server";

import { db, userSettings } from "@holdsworth/db";
import { settingsSchema } from "@/lib/validators";

export interface SettingsData {
  province: string;
  updateFrequency: string;
  alertThreshold: number;
}

export async function getSettings(): Promise<SettingsData> {
  const rows = await db.select().from(userSettings).limit(1);
  if (rows.length > 0) {
    return {
      province: rows[0].province,
      updateFrequency: rows[0].updateFrequency,
      alertThreshold: rows[0].alertThreshold,
    };
  }
  // Return defaults
  return { province: "ON", updateFrequency: "weekly", alertThreshold: 10 };
}

export async function saveSettings(data: SettingsData): Promise<{ success: boolean; error?: string }> {
  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map(i => i.message).join(", ") };
  }
  const rows = await db.select().from(userSettings).limit(1);
  if (rows.length > 0) {
    await db.update(userSettings).set({
      province: data.province,
      updateFrequency: data.updateFrequency,
      alertThreshold: data.alertThreshold,
      updatedAt: new Date(),
    });
  } else {
    await db.insert(userSettings).values({
      province: data.province,
      updateFrequency: data.updateFrequency,
      alertThreshold: data.alertThreshold,
    });
  }
  return { success: true };
}
