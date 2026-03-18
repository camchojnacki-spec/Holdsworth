"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, RotateCcw, Camera, Upload } from "lucide-react";
import { scanCard, type ScanActionResult } from "@/actions/scanner";
import { createCard } from "@/actions/cards";
import type { CardScanResponse } from "@/lib/ai/gemini";

type ScanState = "idle" | "analyzing" | "results" | "saving" | "error";

export default function ScanPage() {
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CardScanResponse | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setState("analyzing");

    const formData = new FormData();
    formData.append("image", file);

    const response: ScanActionResult = await scanCard(formData);

    if (response.success && response.data) {
      setResult(response.data);
      setProcessingTime(response.processingTimeMs ?? null);
      setState("results");
    } else {
      setError(response.error ?? "Pull did not resolve. Adjust angle or lighting.");
      setState("error");
    }
  };

  const handleCatalogue = async () => {
    if (!result) return;
    setState("saving");

    try {
      const { id } = await createCard({
        playerName: result.player_name,
        team: result.team,
        position: result.position ?? undefined,
        year: result.year,
        setName: result.set_name,
        manufacturer: result.manufacturer,
        cardNumber: result.card_number,
        parallelVariant: result.parallel_variant ?? undefined,
        isRookieCard: result.is_rookie_card,
        condition: result.condition_estimate,
        conditionNotes: result.condition_notes,
        graded: result.graded,
        gradingCompany: result.grading_company ?? undefined,
        grade: result.grade ?? undefined,
        aiRawResponse: result as unknown as Record<string, unknown>,
      });

      router.push(`/cards/${id}`);
    } catch {
      setError("Failed to save card to collection.");
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setPreview(null);
    setResult(null);
    setError(null);
    setProcessingTime(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Pull</h1>
        <p className="text-muted-foreground text-sm mt-1">Photograph a card. Holdsworth identifies it.</p>
      </div>

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileSelect} />
      <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} />

      {state === "idle" && (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center w-full py-16 px-4">
              {/* Scan viewfinder icon */}
              <div className="relative mb-8 w-20 h-16">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--color-burg)]" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--color-burg)]" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--color-burg)]" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--color-burg)]" />
                <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-[var(--color-burg)] opacity-60" style={{ animation: "scanH 2.5s cubic-bezier(0.25,0.1,0.25,1) infinite" }} />
              </div>

              <span style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white text-center">Place card in frame</span>
              <span className="text-sm text-muted-foreground mt-2 text-center">Photograph front. Back optional but recommended.</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-4">High resolution for best identification</span>

              {/* Two action buttons */}
              <div className="flex gap-3 mt-8 w-full max-w-xs">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {state === "analyzing" && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center">
              {preview && <img src={preview} alt="Card under analysis" className="h-64 w-auto object-contain rounded-lg mb-6" />}
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden mb-4">
                <div className="absolute h-full w-1/3 rounded-full" style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }} />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white">Analyzing card</p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-2">Scanning · Identifying · Appraising</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(state === "results" || state === "saving") && result && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                {preview && <img src={preview} alt="Scanned card" className="w-full rounded-lg" />}
                {processingTime && (
                  <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground mt-3 text-center">
                    Identified in {(processingTime / 1000).toFixed(1)}s
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Identification</CardTitle>
                  <Badge variant={result.confidence > 0.8 ? "success" : result.confidence > 0.5 ? "warning" : "destructive"}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{Math.round(result.confidence * 100)}%</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Player" value={result.player_name} />
                <Field label="Team" value={result.team} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Year" value={String(result.year)} />
                  <Field label="Card #" value={result.card_number} />
                </div>
                <Field label="Set" value={result.set_name} />
                <Field label="Manufacturer" value={result.manufacturer} />
                {result.parallel_variant && <Field label="Parallel" value={result.parallel_variant} highlight />}
                {result.serial_number && <Field label="Serial" value={result.serial_number} highlight />}
                <Field label="Condition" value={result.condition_estimate} />
                {result.centering_estimate && <Field label="Centering" value={result.centering_estimate} mono />}

                <div className="flex flex-wrap gap-1.5 pt-2">
                  {result.is_rookie_card && <Badge variant="default">RC</Badge>}
                  {result.is_prospect_card && <Badge variant="secondary">Prospect</Badge>}
                  {result.is_autograph && <Badge variant="default">Auto</Badge>}
                  {result.is_relic && <Badge variant="default">Relic</Badge>}
                  {result.is_short_print && <Badge variant="warning">SP</Badge>}
                  {result.graded && <Badge variant="secondary">{result.grading_company} {result.grade}</Badge>}
                  {!result.is_authentic && <Badge variant="destructive">Authenticity Concern</Badge>}
                </div>

                {result.condition_notes && <p className="text-xs text-muted-foreground pt-1">{result.condition_notes}</p>}
                {result.identification_notes && <p className="text-xs text-muted-foreground">{result.identification_notes}</p>}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={reset} disabled={state === "saving"} className="gap-2">
              <RotateCcw className="h-4 w-4" />Pull Another
            </Button>
            <Button onClick={handleCatalogue} disabled={state === "saving"} className="gap-2">
              {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {state === "saving" ? "Cataloguing..." : "Catalogue"}
            </Button>
          </div>
        </div>
      )}

      {state === "error" && (
        <Card>
          <CardContent className="p-8 text-center">
            <X className="mx-auto h-8 w-8 text-destructive mb-4" />
            <p style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white">Pull did not resolve</p>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
            <Button variant="outline" onClick={reset} className="mt-6 gap-2"><RotateCcw className="h-4 w-4" />Try Again</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div>
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">{label}</label>
      <Input defaultValue={value} className={highlight ? "border-[var(--color-burg-border)]" : ""} style={{ ...(mono ? { fontFamily: "var(--font-mono)" } : {}), ...(highlight ? { color: "var(--color-burg-light)" } : {}) }} />
    </div>
  );
}
