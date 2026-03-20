"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, X, ChevronDown, ChevronUp, AlertTriangle, Loader2 } from "lucide-react";
import type { CardScanResponse } from "@/lib/ai/gemini";

export type BatchItemStatus = "queued" | "scanning" | "done" | "error";

export interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: BatchItemStatus;
  result?: CardScanResponse & { _aiCorrected?: boolean; _referenceCardId?: string; _subsetOrInsert?: string | null };
  error?: string;
  editedFields?: Record<string, string>;
  selected: boolean; // whether to include when adding to collection
}

interface BatchResultCardProps {
  item: BatchItem;
  onToggleSelect: (id: string) => void;
  onUpdateField: (id: string, field: string, value: string) => void;
  onSkip: (id: string) => void;
}

export function BatchResultCard({ item, onToggleSelect, onUpdateField, onSkip }: BatchResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isLowConfidence = item.result && item.result.confidence < 0.7;

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        item.status === "error"
          ? "border-destructive/40"
          : isLowConfidence
            ? "border-amber-500/40"
            : item.selected
              ? "border-[var(--color-burg)]/50"
              : "border-border"
      }`}
    >
      <div className="flex gap-3 p-3">
        {/* Thumbnail */}
        <div className="w-16 h-[90px] rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
          <img src={item.preview} alt="Card" className="w-full h-full object-cover" />
          {item.status === "scanning" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-[var(--color-burg-light)] animate-spin" />
            </div>
          )}
          {item.status === "queued" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-wider uppercase text-white/70">
                Queued
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {item.status === "done" && item.result && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <p style={{ fontFamily: "var(--font-display)" }} className="text-sm text-white truncate">
                  {item.editedFields?.player_name || item.result.player_name || "Unknown"}
                </p>
                <Badge
                  variant={item.result.confidence > 0.8 ? "success" : item.result.confidence > 0.5 ? "warning" : "destructive"}
                  className="text-[9px] shrink-0"
                >
                  <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(item.result.confidence * 100)}%</span>
                </Badge>
              </div>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground truncate">
                {[item.editedFields?.year || item.result.year, item.editedFields?.set_name || item.result.set_name, item.editedFields?.card_number ? `#${item.editedFields.card_number}` : item.result.card_number ? `#${item.result.card_number}` : null].filter(Boolean).join(" · ")}
              </p>
              {item.result.parallel_variant && (
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[var(--color-burg-light)] truncate mt-0.5">
                  {item.editedFields?.parallel_variant || item.result.parallel_variant}
                </p>
              )}
              {isLowConfidence && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-wider text-amber-300">
                    Review needed
                  </span>
                </div>
              )}
            </>
          )}

          {item.status === "queued" && (
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground mt-2">
              Waiting to process...
            </p>
          )}

          {item.status === "scanning" && (
            <div className="flex items-center gap-2 mt-2">
              <div className="relative w-full h-1 bg-secondary rounded-full overflow-hidden">
                <div className="absolute h-full w-1/3 rounded-full" style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground shrink-0">
                Analyzing
              </span>
            </div>
          )}

          {item.status === "error" && (
            <div className="flex items-center gap-1.5 mt-2">
              <X className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs text-destructive truncate">{item.error || "Scan failed"}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          {item.status === "done" && (
            <>
              <button
                onClick={() => onToggleSelect(item.id)}
                className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all ${
                  item.selected
                    ? "bg-[var(--color-burg)] border-[var(--color-burg)]"
                    : "border-border hover:border-[var(--color-burg)]/50"
                }`}
              >
                {item.selected && <Check className="h-3.5 w-3.5 text-white" />}
              </button>
              <button
                onClick={() => onSkip(item.id)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:border-destructive/50 hover:text-destructive transition-colors text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:border-[var(--color-burg)]/50 transition-colors text-muted-foreground"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expandable edit section */}
      {expanded && item.status === "done" && item.result && (
        <div className="border-t border-border px-3 py-3 space-y-2">
          <EditField label="Player" field="player_name" item={item} onUpdate={onUpdateField} />
          <EditField label="Team" field="team" item={item} onUpdate={onUpdateField} />
          <div className="grid grid-cols-2 gap-2">
            <EditField label="Year" field="year" item={item} onUpdate={onUpdateField} />
            <EditField label="Card #" field="card_number" item={item} onUpdate={onUpdateField} />
          </div>
          <EditField label="Set" field="set_name" item={item} onUpdate={onUpdateField} />
          <EditField label="Manufacturer" field="manufacturer" item={item} onUpdate={onUpdateField} />
          <EditField label="Parallel" field="parallel_variant" item={item} onUpdate={onUpdateField} />
          <EditField label="Condition" field="condition_estimate" item={item} onUpdate={onUpdateField} />

          <div className="flex flex-wrap gap-1 pt-1">
            {item.result.is_rookie_card && <Badge variant="default" className="text-[10px]">RC</Badge>}
            {item.result.is_autograph && <Badge variant="default" className="text-[10px]">Auto</Badge>}
            {item.result.is_relic && <Badge variant="default" className="text-[10px]">Relic</Badge>}
            {item.result.is_short_print && <Badge variant="warning" className="text-[10px]">SP</Badge>}
            {item.result.graded && <Badge variant="secondary" className="text-[10px]">{item.result.grading_company} {item.result.grade}</Badge>}
          </div>

          {item.result.identification_notes && (
            <p className="text-[10px] text-muted-foreground mt-1">{item.result.identification_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  field,
  item,
  onUpdate,
}: {
  label: string;
  field: string;
  item: BatchItem;
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const value = item.editedFields?.[field] ?? String((item.result as unknown as Record<string, unknown>)?.[field] ?? "");
  return (
    <div>
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-wider uppercase text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => onUpdate(item.id, field, e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}
