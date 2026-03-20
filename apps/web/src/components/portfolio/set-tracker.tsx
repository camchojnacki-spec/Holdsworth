"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { getSetCompletions, type SetCompletionData } from "@/actions/set-completion";

export function SetCompletionTracker() {
  const [sets, setSets] = useState<SetCompletionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSet, setExpandedSet] = useState<string | null>(null);

  useEffect(() => {
    getSetCompletions().then((data) => {
      setSets(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Set Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center">
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground animate-pulse">
              Analyzing collection...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sets.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Set Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center">
            <div className="text-center">
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                No sets detected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Scan cards to start tracking set completion
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Set Tracker
          </CardTitle>
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
            {sets.length} sets
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {sets.map((set) => {
          const expanded = expandedSet === set.setId;
          return (
            <div key={set.setId} className="border border-border/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedSet(expanded ? null : set.setId)}
                className="w-full flex items-center gap-3 p-3 hover:bg-secondary/10 transition-colors"
              >
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white truncate">{set.year} {set.setName}</p>
                    {set.manufacturer && (
                      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground hidden sm:inline">
                        {set.manufacturer}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Progress bar */}
                    {set.completionPct != null ? (
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${set.completionPct}%`,
                              backgroundColor: set.completionPct >= 75
                                ? "var(--color-green)"
                                : set.completionPct >= 25
                                ? "var(--color-burg-light)"
                                : "var(--color-burg)",
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                          {set.completionPct}%
                        </span>
                      </div>
                    ) : null}
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                      {set.ownedCount}{set.estimatedTotal ? `/${set.estimatedTotal}` : ""} cards
                    </span>
                  </div>
                </div>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>

              {expanded && (
                <div className="border-t border-border/30 px-3 py-2 bg-secondary/5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {set.cards.map((card) => (
                      <Link
                        key={card.id}
                        href={`/cards/${card.id}`}
                        className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-secondary/20 transition-colors group"
                      >
                        {card.cardNumber && (
                          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground w-6 text-right flex-shrink-0">
                            #{card.cardNumber}
                          </span>
                        )}
                        <span className="text-xs text-white truncate group-hover:text-[var(--color-burg-light)]">
                          {card.playerName}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {set.estimatedTotal && set.ownedCount < set.estimatedTotal && (
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground mt-2">
                      {set.estimatedTotal - set.ownedCount} cards needed to complete this set
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
