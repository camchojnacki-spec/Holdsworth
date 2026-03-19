"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, RotateCcw, Camera, Upload, SwitchCamera } from "lucide-react";
import { scanCard, type ScanActionResult } from "@/actions/scanner";
import { createCard } from "@/actions/cards";
import type { CardScanResponse, CardBoundingBox } from "@/lib/ai/gemini";

type ScanState = "idle" | "camera" | "analyzing" | "results" | "saving" | "error";

/**
 * Crop and straighten a card from an image using AI-detected bounding box.
 */
function cropCardFromImage(imageDataUrl: string, bounds: CardBoundingBox): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(imageDataUrl); return; }

      const w = img.width;
      const h = img.height;

      // Get pixel coordinates of the bounding box
      const tl = { x: bounds.topLeft.x * w, y: bounds.topLeft.y * h };
      const tr = { x: bounds.topRight.x * w, y: bounds.topRight.y * h };
      const bl = { x: bounds.bottomLeft.x * w, y: bounds.bottomLeft.y * h };
      const br = { x: bounds.bottomRight.x * w, y: bounds.bottomRight.y * h };

      // Calculate card dimensions
      const cardW = Math.max(
        Math.hypot(tr.x - tl.x, tr.y - tl.y),
        Math.hypot(br.x - bl.x, br.y - bl.y)
      );
      const cardH = Math.max(
        Math.hypot(bl.x - tl.x, bl.y - tl.y),
        Math.hypot(br.x - tr.x, br.y - tr.y)
      );

      // Standard card aspect is 2.5:3.5
      const targetW = Math.round(cardW);
      const targetH = Math.round(cardW * 3.5 / 2.5);

      canvas.width = targetW;
      canvas.height = targetH;

      // Use perspective transform via drawImage with rotation
      const rotation = (bounds.rotation || 0) * Math.PI / 180;
      const cx = (tl.x + tr.x + bl.x + br.x) / 4;
      const cy = (tl.y + tr.y + bl.y + br.y) / 4;

      ctx.save();
      ctx.translate(targetW / 2, targetH / 2);
      ctx.rotate(-rotation);
      ctx.drawImage(
        img,
        cx - cardW / 2, cy - cardH / 2, cardW, cardH,
        -targetW / 2, -targetH / 2, targetW, targetH
      );
      ctx.restore();

      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = imageDataUrl;
  });
}

export default function ScanPage() {
  const router = useRouter();
  const [state, setState] = useState<ScanState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [result, setResult] = useState<CardScanResponse | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;
      setState("camera");
    } catch {
      setError("Camera access denied. Grant permission or use Upload instead.");
      setState("error");
    }
  }, [facingMode]);

  // Attach stream to video element whenever it mounts or stream changes
  useEffect(() => {
    if (state === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [state]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Capture at full video resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    stopCamera();

    // Convert to high-quality JPEG
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setPreview(dataUrl);
    setState("analyzing");

    // Convert dataURL to File and send to scanner
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setError("Failed to capture image");
          setState("error");
          return;
        }

        const formData = new FormData();
        formData.append("image", blob, "capture.jpg");

        const response: ScanActionResult = await scanCard(formData);

        if (response.success && response.data) {
          setResult(response.data);
          setProcessingTime(response.processingTimeMs ?? null);
          // Crop card from image if bounds detected
          if (response.bounds && dataUrl) {
            cropCardFromImage(dataUrl, response.bounds).then(setCroppedPreview);
          }
          setState("results");
        } else {
          setError(response.error ?? "Pull did not resolve. Adjust angle or lighting.");
          setState("error");
        }
      },
      "image/jpeg",
      0.95
    );
  }, [stopCamera]);

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  // Re-start camera when facing mode changes while camera is active
  useEffect(() => {
    if (state === "camera") {
      startCamera();
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Crop card from uploaded image if bounds detected
      if (response.bounds) {
        const reader2 = new FileReader();
        reader2.onload = (ev2) => {
          const fullDataUrl = ev2.target?.result as string;
          if (fullDataUrl && response.bounds) {
            cropCardFromImage(fullDataUrl, response.bounds).then(setCroppedPreview);
          }
        };
        reader2.readAsDataURL(file);
      }
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
        photoUrl: croppedPreview ?? preview ?? undefined,
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
    setPreview(null);
    setCroppedPreview(null);
    setResult(null);
    setError(null);
    setProcessingTime(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Pull</h1>
        <p className="text-muted-foreground text-sm mt-1">Photograph a card. Holdsworth identifies it.</p>
      </div>

      {/* Hidden file input for upload */}
      <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} />
      {/* Hidden canvas for capturing frames */}
      <canvas ref={canvasRef} className="hidden" />

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

              <div className="flex gap-3 mt-8 w-full max-w-xs">
                <Button onClick={startCamera} className="flex-1 gap-2">
                  <Camera className="h-4 w-4" />
                  Camera
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1 gap-2">
                  <Upload className="h-4 w-4" />
                  Upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {state === "camera" && (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-2xl">
            <div className="relative bg-black">
              {/* Live viewfinder */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-[3/4] sm:aspect-video object-cover"
              />

              {/* Viewfinder overlay with darkened surround */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Dark overlay with card-shaped cutout using box-shadow */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5] rounded-lg"
                  style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
                />
                {/* Card border */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5] rounded-lg border-2 border-white/70">
                  {/* Corner brackets */}
                  <div className="absolute -top-[1px] -left-[1px] w-8 h-8 border-t-[3px] border-l-[3px] border-[var(--color-burg)] rounded-tl-lg" />
                  <div className="absolute -top-[1px] -right-[1px] w-8 h-8 border-t-[3px] border-r-[3px] border-[var(--color-burg)] rounded-tr-lg" />
                  <div className="absolute -bottom-[1px] -left-[1px] w-8 h-8 border-b-[3px] border-l-[3px] border-[var(--color-burg)] rounded-bl-lg" />
                  <div className="absolute -bottom-[1px] -right-[1px] w-8 h-8 border-b-[3px] border-r-[3px] border-[var(--color-burg)] rounded-br-lg" />
                  {/* Scanning line */}
                  <div className="absolute left-3 right-3 h-[2px] bg-[var(--color-burg)]" style={{ animation: "scanH 2.5s cubic-bezier(0.25,0.1,0.25,1) infinite" }} />
                </div>
                {/* FRONT label */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%] aspect-[2.5/3.5]">
                  <span style={{ fontFamily: "var(--font-mono)" }} className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.15em] uppercase text-white/80">
                    Front
                  </span>
                </div>
              </div>

              {/* Controls overlay */}
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center justify-center gap-4">
                  <Button variant="ghost" size="icon" onClick={() => { stopCamera(); reset(); }} className="text-white hover:bg-white/20">
                    <X className="h-5 w-5" />
                  </Button>

                  <button
                    onClick={capturePhoto}
                    className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-white" />
                  </button>

                  <Button variant="ghost" size="icon" onClick={switchCamera} className="text-white hover:bg-white/20">
                    <SwitchCamera className="h-5 w-5" />
                  </Button>
                </div>
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
                {/* Show cropped card if available, otherwise full image */}
                {(croppedPreview || preview) && (
                  <img
                    src={croppedPreview ?? preview ?? ""}
                    alt="Scanned card"
                    className="w-full rounded-lg"
                  />
                )}
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
