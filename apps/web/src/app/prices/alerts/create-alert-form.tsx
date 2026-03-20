"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, X } from "lucide-react";
import { createPriceAlert, searchCardsForAlert, getCardLabelById } from "@/actions/price-alerts";
import { useRouter } from "next/navigation";

export function CreateAlertForm({ prefillCardId }: { prefillCardId?: string }) {
  const [open, setOpen] = useState(!!prefillCardId);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Card search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCard, setSelectedCard] = useState<{ id: string; label: string } | null>(
    prefillCardId ? { id: prefillCardId, label: "Loading..." } : null
  );
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [alertType, setAlertType] = useState<string>("above");
  const [thresholdValue, setThresholdValue] = useState("");
  const [currency, setCurrency] = useState("CAD");

  // Load prefilled card label
  useEffect(() => {
    if (prefillCardId) {
      getCardLabelById(prefillCardId).then((label) => {
        if (label) {
          setSelectedCard({ id: prefillCardId, label });
        }
      });
    }
  }, [prefillCardId]);

  // Debounced card search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchCardsForAlert(searchQuery);
      setSearchResults(results);
      setShowResults(true);
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSubmit() {
    if (!selectedCard || !thresholdValue) return;
    startTransition(async () => {
      await createPriceAlert(selectedCard.id, alertType, parseFloat(thresholdValue), currency);
      // Reset form
      setSelectedCard(null);
      setSearchQuery("");
      setThresholdValue("");
      setAlertType("above");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 bg-[#8B2252] hover:bg-[#a62d63] text-white"
      >
        <Plus className="h-4 w-4" />
        Create Alert
      </Button>
    );
  }

  return (
    <Card className="border-[#8B2252]/30">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-lg font-normal text-white"
          >
            New Price Alert
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Card Search */}
        <div className="space-y-1.5">
          <label
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground"
          >
            Card
          </label>
          {selectedCard ? (
            <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/30 px-3 py-2">
              <span className="text-sm text-white flex-1 truncate">{selectedCard.label}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  setSelectedCard(null);
                  setSearchQuery("");
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by player name, set, or card number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  className="pl-9"
                />
              </div>
              {showResults && searchResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-secondary/50 transition-colors"
                      onClick={() => {
                        setSelectedCard(card);
                        setShowResults(false);
                        setSearchQuery("");
                      }}
                    >
                      {card.label}
                    </button>
                  ))}
                </div>
              )}
              {showResults && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-lg p-3">
                  <p className="text-sm text-muted-foreground">No cards found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alert Type + Threshold */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Condition
            </label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="above">Price goes above</option>
              <option value="below">Price drops below</option>
              <option value="change_pct">Changes by %</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              {alertType === "change_pct" ? "Percentage" : "Threshold"}
            </label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={alertType === "change_pct" ? "e.g. 15" : "e.g. 50.00"}
                value={thresholdValue}
                onChange={(e) => setThresholdValue(e.target.value)}
                style={{ fontFamily: "var(--font-mono)" }}
                className="pr-8"
              />
              <span
                style={{ fontFamily: "var(--font-mono)" }}
                className="absolute right-3 top-2 text-xs text-muted-foreground"
              >
                {alertType === "change_pct" ? "%" : currency}
              </span>
            </div>
          </div>

          {alertType !== "change_pct" && (
            <div className="space-y-1.5">
              <label
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground"
              >
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedCard || !thresholdValue || isPending}
            onClick={handleSubmit}
            className="bg-[#8B2252] hover:bg-[#a62d63] text-white"
          >
            {isPending ? "Creating..." : "Create Alert"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
