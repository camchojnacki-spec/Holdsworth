"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { updateCardIdentification } from "@/actions/cards";
import { searchPlayers, searchSetProducts, getParallelsForSet } from "@/actions/search";
import { useRouter } from "next/navigation";

interface EditIdentificationProps {
  cardId: string;
  playerName: string | null;
  setName: string | null;
  year: number | null;
  cardNumber: string | null;
  parallelVariant: string | null;
}

interface PlayerResult {
  id: string;
  name: string;
  team: string | null;
}

interface SetResult {
  id: string;
  name: string;
  year: number;
}

export function EditIdentification({
  cardId,
  playerName,
  setName,
  year,
  cardNumber,
  parallelVariant,
}: EditIdentificationProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const router = useRouter();

  // Form state
  const [formPlayer, setFormPlayer] = useState(playerName ?? "");
  const [formSet, setFormSet] = useState(setName ?? "");
  const [formYear, setFormYear] = useState(year?.toString() ?? "");
  const [formCardNumber, setFormCardNumber] = useState(cardNumber ?? "");
  const [formParallel, setFormParallel] = useState(parallelVariant ?? "");

  // Autocomplete state
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [setResults, setSetResults] = useState<SetResult[]>([]);
  const [parallelOptions, setParallelOptions] = useState<Array<{ id: string; name: string; printRun: number | null }>>([]);
  const [parallelsLoading, setParallelsLoading] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [showSetDropdown, setShowSetDropdown] = useState(false);
  const [showParallelDropdown, setShowParallelDropdown] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const parallelRef = useRef<HTMLDivElement>(null);

  // Auto-load parallels when modal opens (if set name already exists)
  useEffect(() => {
    if (!open) return;
    if (!formSet || formSet.trim().length < 2) return;
    // Already have parallels loaded (user selected from dropdown)
    if (parallelOptions.length > 0 || selectedSetId) return;

    let cancelled = false;
    setParallelsLoading(true);

    (async () => {
      const results = await searchSetProducts(formSet);
      if (cancelled) return;
      if (results.length > 0) {
        // Find exact match or use first result
        const exactMatch = results.find(
          (r) => r.name.toLowerCase() === formSet.toLowerCase() &&
            (!formYear || r.year === parseInt(formYear))
        ) ?? results[0];
        setSelectedSetId(exactMatch.id);
        const parallels = await getParallelsForSet(exactMatch.id);
        if (!cancelled) {
          setParallelOptions(parallels);
          setParallelsLoading(false);
        }
      } else {
        setParallelsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (playerRef.current && !playerRef.current.contains(e.target as Node)) {
        setShowPlayerDropdown(false);
      }
      if (setRef.current && !setRef.current.contains(e.target as Node)) {
        setShowSetDropdown(false);
      }
      if (parallelRef.current && !parallelRef.current.contains(e.target as Node)) {
        setShowParallelDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search for players
  const playerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handlePlayerSearch = useCallback((value: string) => {
    setFormPlayer(value);
    if (playerTimerRef.current) clearTimeout(playerTimerRef.current);
    if (value.trim().length < 2) {
      setPlayerResults([]);
      setShowPlayerDropdown(false);
      return;
    }
    playerTimerRef.current = setTimeout(async () => {
      const results = await searchPlayers(value);
      setPlayerResults(results);
      setShowPlayerDropdown(results.length > 0);
    }, 300);
  }, []);

  // Debounced search for sets
  const setTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleSetSearch = useCallback((value: string) => {
    setFormSet(value);
    setParallelOptions([]);
    setSelectedSetId(null);
    setFormParallel("");
    if (setTimerRef.current) clearTimeout(setTimerRef.current);
    if (value.trim().length < 2) {
      setSetResults([]);
      setShowSetDropdown(false);
      return;
    }
    setTimerRef.current = setTimeout(async () => {
      const results = await searchSetProducts(value);
      setSetResults(results);
      setShowSetDropdown(results.length > 0);
    }, 300);
  }, []);

  // When a set is selected, load parallels
  const handleSelectSet = useCallback(async (result: SetResult) => {
    setFormSet(result.name);
    if (result.year) setFormYear(result.year.toString());
    setShowSetDropdown(false);
    setSelectedSetId(result.id);
    setFormParallel(""); // Reset parallel when set changes
    setParallelsLoading(true);
    // Load parallel options for this set product
    const parallels = await getParallelsForSet(result.id);
    setParallelOptions(parallels);
    setParallelsLoading(false);
  }, []);

  function handleSelectPlayer(result: PlayerResult) {
    setFormPlayer(result.name);
    setShowPlayerDropdown(false);
  }

  function handleSave() {
    startTransition(async () => {
      const yearNum = formYear ? parseInt(formYear) : undefined;
      const result = await updateCardIdentification(cardId, {
        playerName: formPlayer || undefined,
        setName: formSet || undefined,
        year: yearNum,
        cardNumber: formCardNumber || undefined,
        parallelVariant: formParallel || undefined,
      });
      if (result.success) {
        setMessage({ type: "success", text: "Identification updated. Re-pricing..." });
        setTimeout(() => {
          setMessage(null);
          setOpen(false);
          router.refresh();
        }, 2000);
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to update" });
        setTimeout(() => setMessage(null), 4000);
      }
    });
  }

  function handleCancel() {
    setFormPlayer(playerName ?? "");
    setFormSet(setName ?? "");
    setFormYear(year?.toString() ?? "");
    setFormCardNumber(cardNumber ?? "");
    setFormParallel(parallelVariant ?? "");
    setMessage(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1 h-7 px-2 text-[11px] text-[var(--color-burg-light)] hover:bg-[#8B2252]/10"
      >
        <Pencil className="h-3 w-3" />
        Edit Identification
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-burg)]/30 bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3
          style={{ fontFamily: "var(--font-display)" }}
          className="text-sm font-normal text-white"
        >
          Edit Identification
        </h3>
        <button onClick={handleCancel} className="text-muted-foreground hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Player Name with typeahead */}
      <div ref={playerRef} className="relative">
        <label
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-wider uppercase text-muted-foreground"
        >
          Player
        </label>
        <Input
          value={formPlayer}
          onChange={(e) => handlePlayerSearch(e.target.value)}
          onFocus={() => playerResults.length > 0 && setShowPlayerDropdown(true)}
          placeholder="Player name"
          className="mt-1 h-8 text-sm"
        />
        {showPlayerDropdown && playerResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg max-h-40 overflow-y-auto">
            {playerResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelectPlayer(r)}
                className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-accent/50 transition-colors"
              >
                {r.name}
                {r.team && (
                  <span className="text-muted-foreground text-xs ml-2">{r.team}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Set Name with typeahead */}
      <div ref={setRef} className="relative">
        <label
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-wider uppercase text-muted-foreground"
        >
          Set
        </label>
        <Input
          value={formSet}
          onChange={(e) => handleSetSearch(e.target.value)}
          onFocus={() => setResults.length > 0 && setShowSetDropdown(true)}
          placeholder="Set name"
          className="mt-1 h-8 text-sm"
        />
        {showSetDropdown && setResults.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg max-h-40 overflow-y-auto">
            {setResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelectSet(r)}
                className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-accent/50 transition-colors"
              >
                {r.name}
                {r.year && (
                  <span className="text-muted-foreground text-xs ml-2">{r.year}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Year */}
        <div>
          <label
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground"
          >
            Year
          </label>
          <Input
            value={formYear}
            onChange={(e) => setFormYear(e.target.value)}
            placeholder="Year"
            type="number"
            className="mt-1 h-8 text-sm"
          />
        </div>
        {/* Card Number */}
        <div>
          <label
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground"
          >
            Card #
          </label>
          <Input
            value={formCardNumber}
            onChange={(e) => setFormCardNumber(e.target.value)}
            placeholder="Card number"
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>

      {/* Parallel — always a constrained dropdown from the reference DB */}
      <div ref={parallelRef} className="relative">
        <label
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-wider uppercase text-muted-foreground"
        >
          Parallel / Variant
        </label>
        {parallelsLoading ? (
          <div className="mt-1 flex h-8 items-center gap-2 px-3 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading variants...
          </div>
        ) : parallelOptions.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setShowParallelDropdown(!showParallelDropdown)}
              className="mt-1 flex h-8 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className={formParallel ? "text-white" : "text-muted-foreground"}>
                {formParallel || "Base / No Parallel"}
              </span>
              <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showParallelDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setFormParallel(""); setShowParallelDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    !formParallel ? "text-[var(--color-burg-light)] bg-accent/30" : "text-white hover:bg-accent/50"
                  }`}
                >
                  Base / No Parallel
                </button>
                {parallelOptions.map((p) => {
                  // Don't double-append print run if name already contains it
                  const displayName = p.name;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setFormParallel(p.name); setShowParallelDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                        formParallel === p.name ? "text-[var(--color-burg-light)] bg-accent/30" : "text-white hover:bg-accent/50"
                      }`}
                    >
                      {displayName}
                      {p.printRun && !displayName.includes(`/${p.printRun}`) && (
                        <span className="text-muted-foreground ml-1">/{p.printRun}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1">
            <button
              type="button"
              disabled
              className="flex h-8 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm text-muted-foreground"
            >
              Base / No Parallel
            </button>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[9px] text-muted-foreground mt-1"
            >
              {formSet ? "No variants found for this set — select a set above to load variants" : "Select a set to load available variants"}
            </p>
          </div>
        )}
      </div>

      {/* Message */}
      {message && (
        <p
          style={{ fontFamily: "var(--font-mono)" }}
          className={`text-[11px] ${message.type === "success" ? "text-[var(--color-green)]" : "text-red-400"}`}
        >
          {message.text}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 text-xs">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending}
          className="h-7 text-xs gap-1"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              Save & Re-price
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
