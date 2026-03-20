"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScanLine, Library, TrendingUp, X } from "lucide-react";

const steps = [
  {
    icon: ScanLine,
    title: "Scan Your First Card",
    description:
      "Point your camera at any sports card and let Holdsworth's AI identify the player, set, year, and condition instantly. No manual data entry required.",
    href: "/scan",
    action: "Start Scanning",
  },
  {
    icon: Library,
    title: "Explore Your Collection",
    description:
      "Your binder organizes every card with photos, details, and filters. Search by player, year, or set to find anything in seconds.",
    href: "/cards",
    action: "Open Binder",
  },
  {
    icon: TrendingUp,
    title: "Track Market Value",
    description:
      "Holdsworth scouts eBay, 130point, and other sources to find real comparable sales and estimate what your cards are worth.",
    href: "/prices",
    action: "View Portfolio",
  },
];

export function WelcomeFlow() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative rounded-xl p-[1px] overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(139,34,82,0.3) 0%, rgba(139,34,82,0.08) 50%, rgba(139,34,82,0.2) 100%)" }}>
      <div className="rounded-xl bg-card/95 backdrop-blur-sm p-4 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 sm:mb-8">
          <div>
            <h2 style={{ fontFamily: "var(--font-display)" }} className="text-2xl sm:text-3xl font-light tracking-wide text-white">
              Welcome to Holdsworth
            </h2>
            <p className="text-sm text-muted-foreground mt-1 sm:mt-2 max-w-md">
              Your AI-powered sports card collection manager. Get started in three steps.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-2 h-8 px-2"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">Skip</span>
          </Button>
        </div>

        {/* Steps */}
        <div className="space-y-3 sm:space-y-4">
          {steps.map((step, i) => (
            <Card key={step.title} className="bg-secondary/10 border-border/50 hover:border-[var(--color-burg)]/30 transition-colors">
              <CardContent className="flex items-center gap-4 sm:gap-6 p-4 sm:p-5">
                {/* Step number + icon */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground/50">
                    0{i + 1}
                  </span>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[var(--color-burg)]/10 flex items-center justify-center">
                    <step.icon className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--color-burg-light)]" />
                  </div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <h3 style={{ fontFamily: "var(--font-display)" }} className="text-base sm:text-lg font-normal text-white">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">
                    {step.description}
                  </p>
                </div>

                {/* Action */}
                <Link href={step.href} className="flex-shrink-0">
                  <Button
                    variant={i === 0 ? "default" : "outline"}
                    size="sm"
                    className="h-8 sm:h-9 px-3 sm:px-4 gap-1.5"
                  >
                    <span className="hidden sm:inline text-xs">{step.action}</span>
                    <step.icon className="h-3.5 w-3.5 sm:hidden" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
