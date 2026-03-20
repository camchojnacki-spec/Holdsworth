"use client";

import { useState, useCallback } from "react";
import { CardGridItem } from "@/components/cards/card-grid-item";
import { BulkActions } from "@/components/cards/bulk-actions";
import type { CardWithDetails } from "@/types/cards";

interface CardBinderGridProps {
  cards: CardWithDetails[];
  totalCount: number;
}

export function CardBinderGrid({ cards, totalCount }: CardBinderGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(cards.map((c) => c.id)));
  }, [cards]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleComplete = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-4">
        {cards.map((card) => (
          <CardGridItem
            key={card.id}
            card={card}
            isSelected={selectedIds.has(card.id)}
            isSelecting={isSelecting}
            onToggleSelect={handleToggleSelect}
          />
        ))}
      </div>

      {isSelecting && (
        <BulkActions
          selectedIds={selectedIds}
          totalCount={totalCount}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onComplete={handleComplete}
        />
      )}

      {/* Spacer when bulk actions bar is visible to prevent content from being hidden behind it */}
      {isSelecting && <div className="h-16" />}
    </>
  );
}
