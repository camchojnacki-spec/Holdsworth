"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, Check, X, Camera, Upload, Package, ArrowRight,
  ChevronDown, CheckCircle2,
} from "lucide-react";
import {
  createRipSession,
  ripScanCard,
  getRipSession,
  catalogueAllRipCards,
  updateRipCard,
  catalogueRipCard,
} from "@/actions/rip";
import type { CardScanResponse } from "@/lib/ai/gemini";

type RipState = "idle" | "scanning" | "reviewing" | "cataloguing";

interface ScannedCard {
  id: string;
  aiResult: CardScanResponse;
  confidence: number;
  frontPhotoUrl: string | null;
  status: string;
  userEdits?: Record<string, string>;
}

function compressImage(imageDataUrl: string, maxWidth = 2000): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(imageDataUrl); return; }
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = imageDataUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}

export default function PackRipPage() {
  const router = useRouter();
  const [state, setState] = useState<RipState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanningCard, setScanningCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogueResult, setCatalogueResult] = useState<{ catalogued: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const startSession = async () => {
    const session = await createRipSession(sessionName || undefined);
    setSessionId(session.id);
    setState("scanning");
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;

    setScanningCard(true);
    setError(null);

    try {
      const rawDataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = (ev) => res(ev.target?.result as string);
        r.readAsDataURL(file);
      });

      const compressed = await compressImage(rawDataUrl);
      const blob = await dataUrlToBlob(compressed);

      const formData = new FormData();
      formData.append("image", blob, "front.jpg");

      const result = await ripScanCard(sessionId, formData);
      if (result.success && result.cardId) {
        // Refresh session data
        const sessionData = await getRipSession(sessionId);
        if (sessionData) {
          setScannedCards(
            sessionData.cards.map((c) => ({
              id: c.id,
              aiResult: c.aiResult as unknown as CardScanResponse,
              confidence: c.confidence ?? 0,
              frontPhotoUrl: c.frontPhotoUrl,
              status: c.status,
              userEdits: c.userEdits as Record<string, string> | undefined,
            }))
          );
        }
      } else {
        setError(result.error || "Scan failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    }

    setScanningCard(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, [sessionId]);

  const handleCatalogueAll = async () => {
    if (!sessionId) return;
    setState("cataloguing");
    const result = await catalogueAllRipCards(sessionId);
    setCatalogueResult(result);
    setState("idle");
  };

  const handleCatalogueSingle = async (ripCardId: string) => {
    await catalogueRipCard(ripCardId);
    // Refresh
    if (sessionId) {
      const sessionData = await getRipSession(sessionId);
      if (sessionData) {
        setScannedCards(
          sessionData.cards.map((c) => ({
            id: c.id,
            aiResult: c.aiResult as unknown as CardScanResponse,
            confidence: c.confidence ?? 0,
            frontPhotoUrl: c.frontPhotoUrl,
            status: c.status,
            userEdits: c.userEdits as Record<string, string> | undefined,
          }))
        );
      }
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
          Pack Rip
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Batch scan an entire pack or box. Review and catalogue after.
        </p>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} />
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />

      {/* ── IDLE: Start session ── */}
      {state === "idle" && !catalogueResult && (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center w-full py-16 px-4">
              <Package className="h-12 w-12 text-[var(--color-burg)] opacity-60 mb-4" />
              <span style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white text-center">
                Open a pack
              </span>
              <span className="text-sm text-muted-foreground mt-2 text-center max-w-md">
                Snap each card as you pull it. Holdsworth identifies them in real-time.
                Review and catalogue everything when you&apos;re done.
              </span>
              <div className="w-full max-w-xs mt-6 space-y-3">
                <Input
                  placeholder="Session name (optional)"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="text-center"
                />
                <Button onClick={startSession} className="w-full gap-2">
                  <Package className="h-4 w-4" />
                  Start Ripping
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Complete result ── */}
      {catalogueResult && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--color-green-light)] mb-4" />
            <p style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white">
              Pack complete!
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {catalogueResult.catalogued} of {catalogueResult.total} cards catalogued
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={() => { setCatalogueResult(null); setScannedCards([]); setSessionId(null); }}>
                Rip Another
              </Button>
              <Button onClick={() => router.push("/cards")}>
                View Binder
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SCANNING: Active rip session ── */}
      {(state === "scanning" || state === "reviewing") && (
        <div className="space-y-4">
          {/* Scan controls */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--color-burg)]/20">
                    <Package className="h-5 w-5 text-[var(--color-burg-light)]" />
                  </div>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                      {scannedCards.length} cards scanned
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                      {scannedCards.filter(c => c.status === "catalogued").length} catalogued
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {scanningCard ? (
                    <Button disabled className="gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scanning...
                    </Button>
                  ) : (
                    <>
                      <Button onClick={() => cameraInputRef.current?.click()} className="gap-2">
                        <Camera className="h-4 w-4" />
                        <span className="hidden sm:inline">Snap Card</span>
                      </Button>
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                        <Upload className="h-4 w-4" />
                        <span className="hidden sm:inline">Upload</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {error && (
                <p className="text-xs text-red-400 mt-2">{error}</p>
              )}
            </CardContent>
          </Card>

          {/* Scanned cards grid */}
          {scannedCards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scannedCards.map((card, i) => (
                <RipCardItem
                  key={card.id}
                  card={card}
                  index={i + 1}
                  onCatalogue={() => handleCatalogueSingle(card.id)}
                />
              ))}
            </div>
          )}

          {/* Bottom action bar */}
          {scannedCards.length > 0 && (
            <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4">
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground">
                {scannedCards.filter(c => c.status !== "catalogued").length} cards ready to catalogue
              </p>
              <Button onClick={handleCatalogueAll} className="gap-2">
                <Check className="h-4 w-4" />
                Catalogue All
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── CATALOGUING ── */}
      {state === "cataloguing" && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="absolute h-full w-1/3 rounded-full"
                  style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
                />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                Cataloguing {scannedCards.length} cards...
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                Creating records · Uploading photos · Queuing prices
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Individual Rip Card ──

function RipCardItem({ card, index, onCatalogue }: { card: ScannedCard; index: number; onCatalogue: () => void }) {
  const ai = card.aiResult;
  const isCatalogued = card.status === "catalogued";

  return (
    <Card className={isCatalogued ? "opacity-60" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          {card.frontPhotoUrl ? (
            <img src={card.frontPhotoUrl} alt={ai?.player_name || "Card"} className="w-14 h-20 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-20 rounded bg-secondary/30 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">#{index}</span>
              <Badge
                variant={card.confidence >= 80 ? "success" : card.confidence >= 50 ? "warning" : "destructive"}
                className="text-[9px] h-4 px-1"
              >
                {card.confidence}%
              </Badge>
              {isCatalogued && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1">
                  <Check className="h-2 w-2 mr-0.5" />Done
                </Badge>
              )}
            </div>
            <p className="text-sm text-white truncate mt-0.5">{ai?.player_name || "Unknown"}</p>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground truncate">
              {[ai?.year, ai?.set_name, ai?.card_number ? `#${ai.card_number}` : null].filter(Boolean).join(" · ")}
            </p>
            {ai?.parallel_variant && (
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[var(--color-burg-light)] truncate">
                {ai.parallel_variant}
              </p>
            )}
            <div className="flex gap-1 mt-1">
              {ai?.is_rookie_card && <Badge variant="default" className="text-[8px] h-3.5 px-1">RC</Badge>}
              {ai?.is_autograph && <Badge variant="default" className="text-[8px] h-3.5 px-1">Auto</Badge>}
              {ai?.is_relic && <Badge variant="default" className="text-[8px] h-3.5 px-1">Relic</Badge>}
            </div>
          </div>
        </div>
        {!isCatalogued && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={onCatalogue}
          >
            Catalogue
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
