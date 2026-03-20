"use server";

import { db, tags, cardTags } from "@holdsworth/db";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getTags() {
  return db.select().from(tags).orderBy(tags.name);
}

export async function createTag(name: string, color: string = "#8B2252") {
  const [tag] = await db.insert(tags).values({ name, color }).returning();
  return tag;
}

export async function deleteTag(tagId: string) {
  await db.delete(tags).where(eq(tags.id, tagId));
}

export async function getCardTags(cardId: string) {
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(cardTags)
    .innerJoin(tags, eq(cardTags.tagId, tags.id))
    .where(eq(cardTags.cardId, cardId));
  return rows;
}

export async function addTagToCard(cardId: string, tagId: string) {
  // Check if already tagged
  const existing = await db
    .select()
    .from(cardTags)
    .where(and(eq(cardTags.cardId, cardId), eq(cardTags.tagId, tagId)))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(cardTags).values({ cardId, tagId });
  revalidatePath(`/cards/${cardId}`);
}

export async function removeTagFromCard(cardId: string, tagId: string) {
  await db
    .delete(cardTags)
    .where(and(eq(cardTags.cardId, cardId), eq(cardTags.tagId, tagId)));
  revalidatePath(`/cards/${cardId}`);
}
