"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { getTags, getCardTags, createTag, addTagToCard, removeTagFromCard } from "@/actions/tags";

interface CardTagsProps {
  cardId: string;
}

const TAG_COLORS = ["#8B2252", "#2D5A27", "#1E3A5F", "#8B4513", "#4A1942", "#5C3317", "#2F4F4F"];

export function CardTags({ cardId }: CardTagsProps) {
  const [cardTagList, setCardTagList] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [allTags, setAllTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    Promise.all([getCardTags(cardId), getTags()]).then(([ct, at]) => {
      setCardTagList(ct);
      setAllTags(at);
    });
  }, [cardId]);

  const handleAddTag = async (tagId: string) => {
    await addTagToCard(cardId, tagId);
    const tag = allTags.find((t) => t.id === tagId);
    if (tag && !cardTagList.find((t) => t.id === tagId)) {
      setCardTagList((prev) => [...prev, tag]);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    await removeTagFromCard(cardId, tagId);
    setCardTagList((prev) => prev.filter((t) => t.id !== tagId));
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    const tag = await createTag(newTagName.trim(), color);
    setAllTags((prev) => [...prev, tag]);
    await addTagToCard(cardId, tag.id);
    setCardTagList((prev) => [...prev, tag]);
    setNewTagName("");
  };

  const availableTags = allTags.filter((t) => !cardTagList.find((ct) => ct.id === t.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {cardTagList.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-white"
            style={{ backgroundColor: tag.color + "40", borderColor: tag.color, borderWidth: 1, fontFamily: "var(--font-mono)" }}
          >
            {tag.name}
            <button onClick={() => handleRemoveTag(tag.id)} className="hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-muted-foreground border border-dashed border-muted-foreground/30 hover:border-[var(--color-burg)] hover:text-[var(--color-burg-light)] transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Plus className="h-3 w-3" /> tag
        </button>
      </div>

      {showPicker && (
        <div className="p-3 rounded-lg bg-secondary/20 border border-border space-y-2">
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  className="px-2 py-0.5 rounded-full text-[11px] text-white hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: tag.color + "60", fontFamily: "var(--font-mono)" }}
                >
                  + {tag.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag name..."
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
            />
            <Button size="sm" variant="outline" onClick={handleCreateTag} className="h-7 text-xs px-2">
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
