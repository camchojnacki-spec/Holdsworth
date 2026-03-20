"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, RotateCcw, ArrowLeft, AlertTriangle } from "lucide-react";
import { getDeletedCards, restoreCard, permanentlyDeleteCard, emptyRecycleBin } from "@/actions/cards";

interface DeletedCard {
  id: string;
  playerName: string | null;
  setName: string | null;
  year: number | null;
  cardNumber: string | null;
  parallelVariant: string | null;
  deletedAt: Date;
}

function daysAgo(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function RecycleBinPage() {
  const [cards, setCards] = useState<DeletedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function loadCards() {
    const deleted = await getDeletedCards();
    setCards(deleted);
    setLoading(false);
  }

  useEffect(() => {
    loadCards();
  }, []);

  function handleRestore(id: string) {
    startTransition(async () => {
      await restoreCard(id);
      await loadCards();
    });
  }

  function handlePermanentDelete(id: string) {
    startTransition(async () => {
      await permanentlyDeleteCard(id);
      setConfirmDeleteId(null);
      await loadCards();
    });
  }

  function handleEmptyBin() {
    startTransition(async () => {
      await emptyRecycleBin();
      setConfirmEmpty(false);
      await loadCards();
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cards">
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl sm:text-3xl font-light tracking-wide text-white">
              Recycle Bin
            </h1>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] sm:text-xs tracking-wider uppercase text-muted-foreground mt-0.5">
              {cards.length} deleted {cards.length === 1 ? "card" : "cards"}
            </p>
          </div>
        </div>
        {cards.length > 0 && (
          <div>
            {confirmEmpty ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delete all?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 px-3 gap-1.5"
                  onClick={handleEmptyBin}
                  disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setConfirmEmpty(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 px-3 text-destructive hover:text-destructive"
                onClick={() => setConfirmEmpty(true)}
                disabled={isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Empty Bin</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-secondary/20 animate-pulse" />
          ))}
        </div>
      ) : cards.length > 0 ? (
        <div className="space-y-2">
          {cards.map((card) => {
            const days = daysAgo(card.deletedAt);
            const daysRemaining = 30 - days;
            return (
              <Card key={card.id} className="bg-card/50">
                <CardContent className="flex items-center justify-between p-3 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {card.playerName ?? "Unknown Player"}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground truncate">
                      {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" \u00B7 ")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      deleted {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}
                      {daysRemaining > 0 && (
                        <span> \u00B7 {daysRemaining} day{daysRemaining === 1 ? "" : "s"} until permanent removal</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 gap-1.5 text-[var(--color-burg-light)] hover:text-[var(--color-burg-light)]"
                      onClick={() => handleRestore(card.id)}
                      disabled={isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Restore</span>
                    </Button>
                    {confirmDeleteId === card.id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 px-2.5"
                          onClick={() => handlePermanentDelete(card.id)}
                          disabled={isPending}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteId(card.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Trash2 className="h-16 w-16 mb-4 opacity-20" />
          <h2 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-white">
            Recycle Bin is Empty
          </h2>
          <p className="text-sm mt-2">Deleted cards will appear here for 30 days</p>
          <Link href="/cards" className="mt-4">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Binder
            </Button>
          </Link>
        </div>
      )}

      {cards.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 pt-2">
          <AlertTriangle className="h-3 w-3" />
          <span>Cards are permanently removed 30 days after deletion</span>
        </div>
      )}
    </div>
  );
}
