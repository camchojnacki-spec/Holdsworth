"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, MoreVertical, Trash2, ExternalLink } from "lucide-react";
import { deleteCard } from "@/actions/cards";
import type { CardWithDetails } from "@/types/cards";

interface CardGridItemProps {
  card: CardWithDetails;
  isSelected?: boolean;
  isSelecting?: boolean;
  onToggleSelect?: (id: string) => void;
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="h-3 w-3 text-success" />;
  if (trend === "down") return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function CardGridItem({ card, isSelected, isSelecting, onToggleSelect }: CardGridItemProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    await deleteCard(card.id);
    setMenuOpen(false);
    router.refresh();
  };

  // Build subtitle — avoid duplicating year if it's already in the set name
  const setDisplay = card.setName || "Unknown Set";
  const yearStr = card.year ? String(card.year) : "";
  const subtitle = yearStr && !setDisplay.includes(yearStr)
    ? `${yearStr} ${setDisplay}`
    : setDisplay;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(card.id);
  };

  return (
    <div className={`group relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 ${isSelected ? "border-[#8B2252] ring-1 ring-[#8B2252]/50" : "border-border hover:border-primary/50"}`}>
      <Link href={`/cards/${card.id}`}>
        {/* Card image */}
        <div className="aspect-[2.5/3.5] bg-muted relative overflow-hidden">
          {/* Selection checkbox */}
          {onToggleSelect && (
            <button
              onClick={handleCheckboxClick}
              className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                isSelected
                  ? "bg-[#8B2252] border-[#8B2252] opacity-100"
                  : isSelecting
                    ? "border-white/60 bg-black/30 opacity-100"
                    : "border-white/60 bg-black/30 opacity-0 group-hover:opacity-100"
              }`}
            >
              {isSelected && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </button>
          )}
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
          {/* Confidence badge — top right */}
          <div className="absolute bottom-2 right-2">
            {card.referenceCardId ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-green)]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-green-light)]" style={{ fontFamily: "var(--font-mono)" }}>
                Verified
              </span>
            ) : card.aiCorrected ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-blue-300" style={{ fontFamily: "var(--font-mono)" }}>
                Corrected
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                AI
              </span>
            )}
          </div>
        </div>

        {/* Card info — compact on mobile, expanded on desktop */}
        <div className="p-2 sm:p-3 space-y-0.5 sm:space-y-1">
          <p style={{ fontFamily: "var(--font-display)" }} className="text-xs sm:text-sm truncate text-white">{card.playerName || "Unknown Player"}</p>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] sm:text-[10px] tracking-wider text-muted-foreground truncate">
            {subtitle}{card.cardNumber ? ` #${card.cardNumber}` : ""}
          </p>
          {/* Parallel — hidden on mobile to save space */}
          {card.parallelVariant && (
            <p style={{ fontFamily: "var(--font-mono)" }} className="hidden sm:block text-[10px] text-[var(--color-burg-light)] truncate">{card.parallelVariant}</p>
          )}
          <div className="flex items-center justify-between pt-0.5 sm:pt-1">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs sm:text-sm font-medium">
              {card.estimatedValueCad
                ? formatCurrency(card.estimatedValueCad, "CAD")
                : "—"}
            </span>
            <TrendIcon trend={card.priceTrend} />
          </div>
        </div>
      </Link>

      {/* Quick action dots */}
      <div className="absolute top-2 right-2">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
        >
          <MoreVertical className="h-3.5 w-3.5 text-white" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
              <Link
                href={`/cards/${card.id}`}
                className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-primary/10 transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="h-3 w-3" /> View Details
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors w-full"
              >
                <Trash2 className="h-3 w-3" /> {deleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
