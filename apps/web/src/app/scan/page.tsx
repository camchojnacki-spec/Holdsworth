"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, RotateCcw, Camera, Upload, SwitchCamera, ArrowRight } from "lucide-react";
import { scanCard, type ScanActionResult } from "@/actions/scanner";
import { createCard } from "@/actions/cards";
import type { CardScanResponse, CardCropRegion } from "@/lib/ai/gemini";

type ScanState = "idle" | "camera-front" | "front-captured" | "camera-back" | "analyzing" | "results" | "saving" | "error";

const MAX_CARD_WIDTH = 800;

function cropCardFromImage(imageDataUrl: string, region: CardCropRegion): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const imgW = img.width;
      const imgH = img.height;
      const sx = Math.round(region.x * imgW);
      const sy = Math.round(region.y * imgH);
      const sw = Math.round(region.width * imgW);
      const sh = Math.round(region.height * imgH);
      const scale = Math.min(1, MAX_CARD_WIDTH / sw);
      const tw = Math.round(sw * scale);
      const th = Math.round(sh * scale);
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(imageDataUrl); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
      resolve(canvas.toDataURL("image/jpeg", 0.90));
    };
    img.src = imageDataUrl;
  });
}

function compressImage(imageDataUrl: string, maxWidth = 1000): Promise<string> {
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

export default function ScanPage() {
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [frontBlob, setFrontBlob] = useState<Blob | null>(null);
  const [backBlob, setBackBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState<CardScanResponse | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [captureTarget, setCaptureTarget] = useState<"front" | "back">("front");

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startCamera = useCallback(async (target: "front" | "back") => {
    setCaptureTarget(target);

    // On mobile or when getUserMedia isn't available over HTTP,
    // use the native camera input which opens the phone's camera app
    // and returns a full-resolution photo
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isSecure = location.protocol === "https:" || location.hostname === "localhost";

    if (isMobile || !isSecure) {
      // Use native <input capture="environment"> — opens phone camera at full resolution
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
      return;
    }

    // Desktop with HTTPS — use WebRTC viewfinder
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setState(target === "front" ? "camera-front" : "camera-back");
    } catch {
      // WebRTC failed — fall back to native camera input
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      }
    }
  }, [facingMode]);

  useEffect(() => {
    if ((state === "camera-front" || state === "camera-back") && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [state]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stopCamera();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    canvas.toBlob((blob) => {
      if (!blob) return;
      if (captureTarget === "front") {
        setFrontPreview(dataUrl);
        setFrontBlob(blob);
        setState("front-captured");
      } else {
        setBackPreview(dataUrl);
        setBackBlob(blob);
        // Back captured — now analyze
        submitForAnalysis(frontBlob!, blob, dataUrl);
      }
    }, "image/jpeg", 0.95);
  }, [stopCamera, captureTarget, frontBlob]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read the file as data URL for preview
    const rawDataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = (ev) => res(ev.target?.result as string);
      r.readAsDataURL(file);
    });

    // Compress for upload — keep high quality but limit to 2000px width
    // Phone cameras produce 12MP+ images that are too large for server actions
    const compressed = await compressImage(rawDataUrl, 2000);
    const compressedBlob = await dataUrlToBlob(compressed);

    if (captureTarget === "front") {
      setFrontPreview(compressed);
      setFrontBlob(compressedBlob);
      setState("front-captured");
    } else {
      setBackPreview(compressed);
      setBackBlob(compressedBlob);
      submitForAnalysis(frontBlob!, compressedBlob, compressed);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, [captureTarget, frontBlob]);

  const submitForAnalysis = async (front: Blob, back: Blob | null, backDataUrl?: string) => {
    setState("analyzing");

    const formData = new FormData();
    formData.append("image", front, "front.jpg");
    if (back) formData.append("backImage", back, "back.jpg");

    const response: ScanActionResult = await scanCard(formData);

    if (response.success && response.data) {
      setResult(response.data);
      setProcessingTime(response.processingTimeMs ?? null);

      // Crop from front image
      const frontDataUrl = frontPreview!;
      if (response.bounds) {
        const cropped = await cropCardFromImage(frontDataUrl, response.bounds);
        setCroppedPreview(cropped);
      } else {
        const compressed = await compressImage(frontDataUrl, MAX_CARD_WIDTH);
        setCroppedPreview(compressed);
      }
      setState("results");
    } else {
      setError(response.error ?? "Pull did not resolve. Adjust angle or lighting.");
      setState("error");
    }
  };

  const skipBack = () => {
    if (!frontBlob) return;
    submitForAnalysis(frontBlob, null);
  };

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  useEffect(() => {
    if (state === "camera-front" || state === "camera-back") startCamera(captureTarget);
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
        photoUrl: croppedPreview ?? frontPreview ?? undefined,
      });
      router.push(`/cards/${id}`);
    } catch {
      setError("Failed to save card to collection.");
      setState("error");
    }
  };

  const reset = () => {
    stopCamera();
    setState("idle");
    setFrontPreview(null);
    setBackPreview(null);
    setCroppedPreview(null);
    setFrontBlob(null);
    setBackBlob(null);
    setResult(null);
    setError(null);
    setProcessingTime(null);
    setCaptureTarget("front");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const isCamera = state === "camera-front" || state === "camera-back";
  const cameraLabel = state === "camera-front" ? "Front" : "Back";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Pull</h1>
        <p className="text-muted-foreground text-sm mt-1">Photograph a card. Holdsworth identifies it.</p>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} />
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── IDLE ── */}
      {state === "idle" && (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center w-full py-16 px-4">
              <div className="relative mb-8 w-20 h-16">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--color-burg)]" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--color-burg)]" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--color-burg)]" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--color-burg)]" />
                <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-[var(--color-burg)] opacity-60" style={{ animation: "scanH 2.5s cubic-bezier(0.25,0.1,0.25,1) infinite" }} />
              </div>
              <span style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white text-center">Place card in frame</span>
              <span className="text-sm text-muted-foreground mt-2 text-center">Start with the front. You can add the back for better accuracy.</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-4">Step 1 of 2 · Front side</span>
              <div className="flex gap-3 mt-8 w-full max-w-xs">
                <Button onClick={() => { setCaptureTarget("front"); startCamera("front"); }} className="flex-1 gap-2">
                  <Camera className="h-4 w-4" />Camera
                </Button>
                <Button variant="outline" onClick={() => { setCaptureTarget("front"); fileInputRef.current?.click(); }} className="flex-1 gap-2">
                  <Upload className="h-4 w-4" />Upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CAMERA (front or back) ── */}
      {isCamera && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-2xl">
            <div className="relative bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[3/4] sm:aspect-video object-cover" />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5] rounded-lg" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5] rounded-lg border-2 border-white/70">
                  <div className="absolute -top-[1px] -left-[1px] w-8 h-8 border-t-[3px] border-l-[3px] border-[var(--color-burg)] rounded-tl-lg" />
                  <div className="absolute -top-[1px] -right-[1px] w-8 h-8 border-t-[3px] border-r-[3px] border-[var(--color-burg)] rounded-tr-lg" />
                  <div className="absolute -bottom-[1px] -left-[1px] w-8 h-8 border-b-[3px] border-l-[3px] border-[var(--color-burg)] rounded-bl-lg" />
                  <div className="absolute -bottom-[1px] -right-[1px] w-8 h-8 border-b-[3px] border-r-[3px] border-[var(--color-burg)] rounded-br-lg" />
                  <div className="absolute left-3 right-3 h-[2px] bg-[var(--color-burg)]" style={{ animation: "scanH 2.5s cubic-bezier(0.25,0.1,0.25,1) infinite" }} />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5]">
                  <span style={{ fontFamily: "var(--font-mono)" }} className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.15em] uppercase text-white/80">{cameraLabel}</span>
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center justify-center gap-4">
                  <Button variant="ghost" size="icon" onClick={() => { stopCamera(); reset(); }} className="text-white hover:bg-white/20"><X className="h-5 w-5" /></Button>
                  <button onClick={capturePhoto} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/20 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-white" />
                  </button>
                  <Button variant="ghost" size="icon" onClick={switchCamera} className="text-white hover:bg-white/20"><SwitchCamera className="h-5 w-5" /></Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── FRONT CAPTURED — prompt for back ── */}
      {state === "front-captured" && frontPreview && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-4">
                <img src={frontPreview} alt="Front captured" className="h-32 w-auto rounded-lg border border-border" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-[var(--color-success-light)]">Front captured</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Now capture the back for card number,<br />copyright year, and serial numbers.</p>
                </div>
              </div>

              <div className="w-full max-w-sm space-y-3">
                <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground block text-center">Step 2 of 2 · Back side</span>
                <div className="flex gap-3">
                  <Button onClick={() => { setCaptureTarget("back"); startCamera("back"); }} className="flex-1 gap-2">
                    <Camera className="h-4 w-4" />Capture Back
                  </Button>
                  <Button variant="outline" onClick={() => { setCaptureTarget("back"); fileInputRef.current?.click(); }} className="flex-1 gap-2">
                    <Upload className="h-4 w-4" />Upload Back
                  </Button>
                </div>
                <Button variant="ghost" onClick={skipBack} className="w-full gap-2 text-muted-foreground">
                  Skip — identify from front only
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ANALYZING ── */}
      {state === "analyzing" && (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center">
              <div className="flex gap-3 mb-6">
                {frontPreview && <img src={frontPreview} alt="Front" className="h-40 w-auto object-contain rounded-lg opacity-60" />}
                {backPreview && <img src={backPreview} alt="Back" className="h-40 w-auto object-contain rounded-lg opacity-60" />}
              </div>
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden mb-4">
                <div className="absolute h-full w-1/3 rounded-full" style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }} />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-xl font-light text-white">Analyzing card</p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-2">
                {backPreview ? "Scanning front · Reading back · Identifying" : "Scanning · Identifying · Appraising"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── RESULTS ── */}
      {(state === "results" || state === "saving") && result && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                {(croppedPreview || frontPreview) && (
                  <img src={croppedPreview ?? frontPreview ?? ""} alt="Scanned card" className="w-full rounded-lg" />
                )}
                {processingTime && (
                  <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground mt-3 text-center">
                    Identified in {(processingTime / 1000).toFixed(1)}s{backPreview ? " · Front + Back" : " · Front only"}
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

      {/* ── ERROR ── */}
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
