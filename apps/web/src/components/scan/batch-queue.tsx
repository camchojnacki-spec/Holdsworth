"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, Upload, Camera, Play, Plus, X } from "lucide-react";
import { batchScanCard, type ScanActionResult } from "@/actions/scanner";
import { createCard } from "@/actions/cards";
import { BatchResultCard, type BatchItem } from "./batch-result-card";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function compressImage(dataUrl: string, maxWidth = 2000): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}

// Delay utility for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SCAN_INTERVAL_MS = 2500; // 2.5 seconds between scans to stay under 10/min

export function BatchQueue() {
  const router = useRouter();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const processedCount = items.filter(i => i.status === "done" || i.status === "error").length;
  const selectedCount = items.filter(i => i.selected && i.status === "done").length;
  const totalCount = items.length;

  const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: BatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const preview = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = (ev) => res(ev.target?.result as string);
        reader.readAsDataURL(file);
      });

      newItems.push({
        id: generateId(),
        file,
        preview,
        status: "queued",
        selected: true,
      });
    }

    setItems(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const processAll = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    // Capture queued items data upfront (preview URLs won't change)
    const queuedItems = items.filter(i => i.status === "queued").map(i => ({ id: i.id, preview: i.preview }));

    for (let idx = 0; idx < queuedItems.length; idx++) {
      if (!processingRef.current) break; // allow cancellation

      const { id: itemId, preview } = queuedItems[idx];

      // Mark as scanning
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: "scanning" as const } : i));

      try {
        // Compress image
        const compressed = await compressImage(preview);
        const blob = await dataUrlToBlob(compressed);

        // Build FormData
        const formData = new FormData();
        formData.append("image", blob, "front.jpg");

        // Call server action
        const response: ScanActionResult = await batchScanCard(formData);

        if (response.success && response.data) {
          const d = response.data;
          setItems(prev => prev.map(i => i.id === itemId ? {
            ...i,
            status: "done" as const,
            result: d,
            editedFields: {
              player_name: d.player_name || "",
              team: d.team || "",
              year: String(d.year || ""),
              card_number: d.card_number || "",
              set_name: d.set_name || "",
              manufacturer: d.manufacturer || "",
              parallel_variant: d.parallel_variant || "",
              serial_number: d.serial_number || "",
              condition_estimate: d.condition_estimate || "",
            },
          } : i));
        } else {
          setItems(prev => prev.map(i => i.id === itemId ? {
            ...i,
            status: "error" as const,
            error: response.error || "Scan failed",
            selected: false,
          } : i));
        }
      } catch (err) {
        setItems(prev => prev.map(i => i.id === itemId ? {
          ...i,
          status: "error" as const,
          error: err instanceof Error ? err.message : "Unknown error",
          selected: false,
        } : i));
      }

      // Rate limit delay (except for last item)
      if (idx < queuedItems.length - 1) {
        await delay(SCAN_INTERVAL_MS);
      }
    }

    setProcessing(false);
    processingRef.current = false;
  }, [items]);

  const stopProcessing = useCallback(() => {
    processingRef.current = false;
    setProcessing(false);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i));
  }, []);

  const updateField = useCallback((id: string, field: string, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      editedFields: { ...i.editedFields, [field]: value },
    } : i));
  }, []);

  const skipItem = useCallback((id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, selected: false } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const selectAll = useCallback(() => {
    setItems(prev => prev.map(i => i.status === "done" ? { ...i, selected: true } : i));
  }, []);

  const deselectAll = useCallback(() => {
    setItems(prev => prev.map(i => ({ ...i, selected: false })));
  }, []);

  const addSelected = useCallback(async () => {
    setAdding(true);
    setAddedCount(0);

    const selectedItems = items.filter(i => i.selected && i.status === "done" && i.result);
    let count = 0;

    for (const item of selectedItems) {
      const result = item.result!;
      const e = item.editedFields || {};

      try {
        const extResult = result as typeof result & { _aiCorrected?: boolean; _referenceCardId?: string; _subsetOrInsert?: string | null };
        await createCard({
          playerName: e.player_name || result.player_name,
          team: e.team || result.team,
          position: result.position ?? undefined,
          year: parseInt(e.year) || result.year,
          setName: e.set_name || result.set_name,
          manufacturer: e.manufacturer || result.manufacturer,
          cardNumber: e.card_number || result.card_number,
          parallelVariant: e.parallel_variant || (result.parallel_variant ?? undefined),
          isRookieCard: result.is_rookie_card,
          condition: e.condition_estimate || result.condition_estimate,
          conditionNotes: result.condition_notes,
          graded: result.graded,
          gradingCompany: result.grading_company ?? undefined,
          grade: result.grade ?? undefined,
          aiRawResponse: result as unknown as Record<string, unknown>,
          photoUrl: item.preview,
          isAutograph: result.is_autograph,
          subsetOrInsert: extResult._subsetOrInsert ?? result.subset_or_insert ?? undefined,
          referenceCardId: extResult._referenceCardId,
          aiCorrected: extResult._aiCorrected || Object.keys(e).some(k => e[k] !== String((result as unknown as Record<string, unknown>)[k] ?? "")),
        });
        count++;
        setAddedCount(count);
      } catch (err) {
        console.error(`[batch] Failed to add card:`, err);
      }
    }

    setAdding(false);

    if (count > 0) {
      router.push("/cards");
    }
  }, [items, router]);

  const clearAll = useCallback(() => {
    setItems([]);
    setAddedCount(0);
  }, []);

  const hasQueued = items.some(i => i.status === "queued");
  const allDone = totalCount > 0 && items.every(i => i.status === "done" || i.status === "error");

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
              {processedCount} of {totalCount} processed
            </span>
            {processing && (
              <button onClick={stopProcessing} className="text-xs text-destructive hover:underline">
                Stop
              </button>
            )}
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${totalCount > 0 ? (processedCount / totalCount) * 100 : 0}%`,
                background: "var(--color-burg)",
              }}
            />
          </div>
        </div>
      )}

      {/* Empty state / drop zone */}
      {totalCount === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center w-full py-16 px-4">
              <div className="relative mb-6 w-24 h-20">
                {/* Stack of cards icon */}
                <div className="absolute top-0 left-2 w-16 h-[72px] rounded-lg border-2 border-[var(--color-burg)]/30 bg-card transform -rotate-6" />
                <div className="absolute top-0 left-4 w-16 h-[72px] rounded-lg border-2 border-[var(--color-burg)]/50 bg-card transform rotate-3" />
                <div className="absolute top-0 left-3 w-16 h-[72px] rounded-lg border-2 border-[var(--color-burg)] bg-card flex items-center justify-center">
                  <Upload className="h-6 w-6 text-[var(--color-burg)]" />
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white text-center">
                Batch Scan
              </span>
              <span className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
                Select multiple card images to identify them all at once. Front images only for batch mode.
              </span>
              <div className="flex gap-3 mt-8">
                <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Select Images
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue list */}
      {totalCount > 0 && (
        <div className="space-y-2">
          {items.map(item => (
            <BatchResultCard
              key={item.id}
              item={item}
              onToggleSelect={toggleSelect}
              onUpdateField={updateField}
              onSkip={skipItem}
            />
          ))}
        </div>
      )}

      {/* Action bar */}
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add More
            </Button>
            {allDone && selectedCount > 0 && (
              <>
                <button onClick={selectAll} style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground hover:text-white transition-colors">
                  Select All
                </button>
                <button onClick={deselectAll} style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground hover:text-white transition-colors">
                  Deselect
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasQueued && !processing && (
              <Button onClick={processAll} className="gap-2 h-9">
                <Play className="h-4 w-4" />
                Process All ({items.filter(i => i.status === "queued").length})
              </Button>
            )}

            {processing && (
              <Button disabled className="gap-2 h-9">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </Button>
            )}

            {allDone && selectedCount > 0 && !adding && (
              <Button onClick={addSelected} className="gap-2 h-9">
                <Check className="h-4 w-4" />
                Add {selectedCount} to Collection
              </Button>
            )}

            {adding && (
              <Button disabled className="gap-2 h-9">
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding {addedCount}/{selectedCount}...
              </Button>
            )}

            {allDone && !adding && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFilesSelected}
      />
    </div>
  );
}
