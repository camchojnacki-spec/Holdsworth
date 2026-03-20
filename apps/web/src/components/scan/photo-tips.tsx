"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const tips = [
  {
    icon: "🟫",
    text: "Place card on a dark, non-reflective surface",
  },
  {
    icon: "💡",
    text: "Use natural or bright, even lighting",
  },
  {
    icon: "🔲",
    text: "Fill the frame — card should take up 70%+ of the image",
  },
  {
    icon: "📱",
    text: "Hold phone directly above, parallel to the card",
  },
  {
    icon: "🚫",
    text: "Avoid shadows crossing the card",
  },
  {
    icon: "🔄",
    text: "If in a top-loader or sleeve, watch for glare",
  },
];

export function PhotoTips() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-white"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Tips
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h4
              style={{ fontFamily: "var(--font-display)" }}
              className="text-sm font-light text-white"
            >
              Photo Tips
            </h4>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="px-4 pb-4 space-y-2.5">
            {tips.map((tip) => (
              <li key={tip.text} className="flex items-start gap-2.5">
                <span className="text-sm flex-shrink-0 mt-0.5">{tip.icon}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {tip.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
