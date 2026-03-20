"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkUpdateStatus, bulkDelete, bulkExport } from "@/actions/cards";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  XSquare,
  Package,
  DollarSign,
  CheckCircle,
  Trash2,
  Download,
  X,
  Loader2,
} from "lucide-react";

interface BulkActionsProps {
  selectedIds: Set<string>;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onComplete: () => void;
}

export function BulkActions({
  selectedIds,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onComplete,
}: BulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = selectedIds.size;

  const handleStatusChange = (status: string) => {
    startTransition(async () => {
      await bulkUpdateStatus(Array.from(selectedIds), status);
      router.refresh();
      onComplete();
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      await bulkDelete(Array.from(selectedIds));
      router.refresh();
      onComplete();
      setConfirmDelete(false);
    });
  };

  const handleExport = () => {
    startTransition(async () => {
      const csv = await bulkExport(Array.from(selectedIds));
      // Trigger download via blob
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `holdsworth-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[#1a1a1f]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
        {/* Left: count + select/deselect */}
        <div className="flex items-center gap-3">
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-xs tracking-wider text-white"
          >
            {count} card{count !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-1">
            {count < totalCount && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-white"
              >
                <CheckSquare className="h-3 w-3" />
                All
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeselectAll}
              className="h-7 px-2 text-[10px] gap-1 text-muted-foreground hover:text-white"
            >
              <XSquare className="h-3 w-3" />
              None
            </Button>
          </div>
        </div>

        {/* Center: action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange("in_collection")}
            disabled={isPending}
            className="h-8 px-2.5 text-[11px] gap-1.5 border-border hover:border-[#8B2252] hover:bg-[#8B2252]/10"
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">In Collection</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange("for_sale")}
            disabled={isPending}
            className="h-8 px-2.5 text-[11px] gap-1.5 border-border hover:border-[#8B2252] hover:bg-[#8B2252]/10"
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">For Sale</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange("sold")}
            disabled={isPending}
            className="h-8 px-2.5 text-[11px] gap-1.5 border-border hover:border-[#8B2252] hover:bg-[#8B2252]/10"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sold</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isPending}
            className="h-8 px-2.5 text-[11px] gap-1.5 border-border hover:border-[#8B2252] hover:bg-[#8B2252]/10"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="h-8 px-2.5 text-[11px] gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Confirm Delete {count}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                className="h-8 px-1.5"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
              className="h-8 px-2.5 text-[11px] gap-1.5 border-border hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>

        {/* Right: close */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeselectAll}
          className="h-8 px-2 text-muted-foreground hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
