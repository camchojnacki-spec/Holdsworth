"use client";

import { useEffect, useState } from "react";
import { Camera, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SKIP_COUNT_KEY = "holdsworth:back-photo-skip-count";

interface BackPhotoPromptProps {
  onScanBack: () => void;
  onUploadBack: () => void;
  onSkip: () => void;
}

export function BackPhotoPrompt({
  onScanBack,
  onUploadBack,
  onSkip,
}: BackPhotoPromptProps) {
  const [skipCount, setSkipCount] = useState(0);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SKIP_COUNT_KEY);
      const count = stored ? parseInt(stored, 10) : 0;
      setSkipCount(count);
      // After 3 skips, show in minimized form
      if (count >= 3) setMinimized(true);
    } catch {
      // localStorage not available
    }
  }, []);

  const handleSkip = () => {
    try {
      const newCount = skipCount + 1;
      localStorage.setItem(SKIP_COUNT_KEY, String(newCount));
    } catch {
      // localStorage not available
    }
    onSkip();
  };

  if (minimized) {
    return (
      <div className="rounded-lg border border-border bg-card/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-lg">📸</span>
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] tracking-wider uppercase text-muted-foreground hover:text-white transition-colors"
            >
              Add back photo for better accuracy
            </span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-xs text-muted-foreground h-7"
          >
            Skip
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-burg-border)] bg-card/60 px-5 py-5">
      <div className="flex flex-col items-center text-center gap-4">
        <div>
          <h3
            style={{ fontFamily: "var(--font-display)" }}
            className="text-lg font-light text-white"
          >
            <span className="mr-2">📸</span>Scan the Back for +20% Accuracy
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            The copyright year and card number on the back dramatically improve
            identification accuracy.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[11px] tracking-wider uppercase text-muted-foreground block text-center"
          >
            Step 2 of 2 · Back side
          </span>
          <div className="flex gap-3">
            <Button onClick={onScanBack} className="flex-1 gap-2">
              <Camera className="h-4 w-4" />
              Scan Back
            </Button>
            <Button
              variant="outline"
              onClick={onUploadBack}
              className="flex-1 gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Back
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="w-full gap-2 text-muted-foreground"
          >
            Skip for Now
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
