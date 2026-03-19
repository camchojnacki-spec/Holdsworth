"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { CardWithDetails } from "@/types/cards";

interface CardGridItemProps {
  card: CardWithDetails;
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-success" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function CardGridItem({ card }: CardGridItemProps) {
  return (
    <Link href={`/cards/${card.id}`}>
      <div className="group relative rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        {/* Card image */}
        <div className="aspect-[2.5/3.5] bg-muted relative overflow-hidden">
          {(card.thumbnailUrl || card.originalUrl) ? (
            <img
              src={card.thumbnailUrl || card.originalUrl || ""}
              alt={`${card.playerName} card`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <svg width="32" height="44" viewBox="0 0 24 34" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/30">
                <rect x="1" y="1" width="22" height="32" rx="2" />
                <line x1="5" y1="6" x2="19" y2="6" />
                <line x1="5" y1="10" x2="14" y2="10" />
              </svg>
            </div>
          )}
          {/* Badges overlay */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {card.isRookieCard && <Badge variant="default" className="text-[10px]">RC</Badge>}
            {card.graded && (
              <Badge variant="secondary" className="text-[10px]">
                {card.gradingCompany} {card.grade}
              </Badge>
            )}
          </div>
        </div>

        {/* Card info */}
        <div className="p-3 space-y-1">
          <p className="font-semibold text-sm truncate">{card.playerName || "Unknown Player"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {card.year} {card.setName || "Unknown Set"}
            {card.cardNumber ? ` #${card.cardNumber}` : ""}
          </p>
          {card.parallelVariant && (
            <p className="text-xs text-primary truncate">{card.parallelVariant}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium">
              {card.estimatedValueCad
                ? formatCurrency(card.estimatedValueCad, "CAD")
                : "—"}
            </span>
            <TrendIcon trend={card.priceTrend} />
          </div>
        </div>
      </div>
    </Link>
  );
}
