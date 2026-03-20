"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";
import { BatchQueue } from "@/components/scan/batch-queue";

export default function BatchScanPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
            Batch Pull
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload multiple card photos. Holdsworth identifies them all.
          </p>
        </div>
        <Link href="/scan">
          <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
            <ScanLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Single Scan</span>
          </Button>
        </Link>
      </div>

      <BatchQueue />
    </div>
  );
}
