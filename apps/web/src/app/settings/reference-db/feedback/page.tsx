"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { getCorrectionPatterns, getLowConfidenceCards, getImportAttempts } from "@/actions/feedback";

export default function FeedbackDashboardPage() {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [lowConfidence, setLowConfidence] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"patterns" | "confidence" | "imports">("patterns");

  useEffect(() => {
    Promise.all([
      getCorrectionPatterns(),
      getLowConfidenceCards(),
      getImportAttempts(),
    ]).then(([p, lc, im]) => {
      setPatterns(p);
      setLowConfidence(lc);
      setImports(im);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs = [
    { id: "patterns" as const, label: "Correction Patterns", count: patterns.length, icon: BarChart3 },
    { id: "confidence" as const, label: "Low Confidence", count: lowConfidence.length, icon: AlertTriangle },
    { id: "imports" as const, label: "Import Attempts", count: imports.length, icon: RefreshCw },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings/reference-db" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-xl text-white">
          Feedback Dashboard
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-[var(--color-burg)] text-white"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            <span className="text-[10px] bg-accent/30 px-1.5 py-0.5 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "patterns" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Top AI correction patterns from the last 30 days. High-frequency patterns indicate systematic identification errors.
          </p>
          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No correction patterns found yet.</p>
          ) : (
            <div className="space-y-2">
              {patterns.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border/50 px-4 py-3">
                  <div>
                    <div className="text-sm text-white">
                      <span className="text-muted-foreground">{p.fieldName}:</span>{" "}
                      <span className="line-through text-red-400/70">{p.aiOriginalValue}</span>{" "}
                      <span className="text-green-400">→ {p.userCorrectedValue}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{p.frequency}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "confidence" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cards with low pricing confidence. These may have reference data issues or insufficient comps.
          </p>
          {lowConfidence.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No low-confidence cards found.</p>
          ) : (
            <div className="space-y-2">
              {lowConfidence.map((c, i) => (
                <Link
                  key={i}
                  href={`/cards/${c.cardId}`}
                  className="flex items-center justify-between rounded-md border border-border/50 px-4 py-3 hover:bg-accent/20 transition-colors"
                >
                  <div>
                    <div className="text-sm text-white">{c.playerName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.year} {c.setName} {c.parallelVariant ?? "Base"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-yellow-400">{c.confidence}</div>
                    <div className="text-[10px] text-muted-foreground">{c.sampleSize} comps</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "imports" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recent TCDB import attempts — both scan-triggered and scheduled.
          </p>
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No import attempts yet.</p>
          ) : (
            <div className="space-y-2">
              {imports.map((im, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border/50 px-4 py-3">
                  <div>
                    <div className="text-sm text-white">{im.setName} ({im.year})</div>
                    {im.errorMessage && (
                      <div className="text-[10px] text-red-400 mt-0.5 max-w-md truncate">{im.errorMessage}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      im.status === "imported" ? "bg-green-500/20 text-green-300" :
                      im.status === "not_found" ? "bg-yellow-500/20 text-yellow-300" :
                      im.status === "parse_error" ? "bg-red-500/20 text-red-300" :
                      "bg-blue-500/20 text-blue-300"
                    }`}>
                      {im.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {im.attemptsCount}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
