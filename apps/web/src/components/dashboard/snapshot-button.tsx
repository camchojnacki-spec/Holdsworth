"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import { takePortfolioSnapshot } from "@/actions/portfolio";

export function SnapshotButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSnapshot() {
    startTransition(async () => {
      const result = await takePortfolioSnapshot();
      if (result.success) {
        setMessage("Snapshot saved");
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage("Failed to save snapshot");
        setTimeout(() => setMessage(null), 3000);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[11px] text-[var(--color-green)]"
        >
          {message}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSnapshot}
        disabled={isPending}
        className="gap-1.5 h-8 text-xs border-[#8B2252]/40 text-[var(--color-burg-light)] hover:bg-[#8B2252]/10"
      >
        <Camera className="h-3 w-3" />
        {isPending ? "Saving..." : "Take Snapshot"}
      </Button>
    </div>
  );
}
