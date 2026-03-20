"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2,
  ArrowLeft,
  Download,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  importFromTcdb,
  manualAddSetProduct,
} from "@/actions/reference-import";

// ─── TCDB Import Section ─────────────────────────────────────────────────────

function TcdbImportSection() {
  const [tcdbInput, setTcdbInput] = useState("");
  const [productName, setProductName] = useState("");
  const [year, setYear] = useState("");
  const [manufacturer, setManufacturer] = useState("Topps");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    cardsUpserted: number;
    parallelsUpserted: number;
    error?: string;
  } | null>(null);

  const handleImport = async () => {
    if (!tcdbInput.trim()) return;
    setImporting(true);
    setResult(null);

    const res = await importFromTcdb({
      url: tcdbInput.includes("tcdb.com") ? tcdbInput : undefined,
      setId: !tcdbInput.includes("tcdb.com") ? tcdbInput : undefined,
      productName: productName || undefined,
      year: year ? parseInt(year) : undefined,
      manufacturer: manufacturer || undefined,
    });

    setResult(res);
    setImporting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import from TCDB</CardTitle>
        <CardDescription>
          Paste a TCDB checklist URL or set ID to import card data into the reference database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground"
          >
            TCDB URL or Set ID
          </label>
          <Input
            placeholder="https://www.tcdb.com/ViewAll.cfm/sid/12345 or 12345"
            value={tcdbInput}
            onChange={(e) => setTcdbInput(e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Product Name (optional)
            </label>
            <Input
              placeholder="e.g. Topps Series 1"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Year (optional)
            </label>
            <Input
              type="number"
              placeholder="2026"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Manufacturer
            </label>
            <Input
              placeholder="Topps"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleImport}
            disabled={importing || !tcdbInput.trim()}
            className="gap-2"
            style={{ backgroundColor: "var(--color-burg)", color: "white" }}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {importing ? "Importing..." : "Import Checklist"}
          </Button>

          {importing && (
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xs text-muted-foreground animate-pulse"
            >
              Scraping TCDB and upserting cards...
            </span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div
            className={`rounded-md border p-3 text-sm ${
              result.success
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {result.success ? (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                <span>
                  Import complete:{" "}
                  <strong>{result.cardsUpserted}</strong> cards and{" "}
                  <strong>{result.parallelsUpserted}</strong> parallels upserted.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{result.error || "Import failed."}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Manual Entry Section ────────────────────────────────────────────────────

interface ManualCard {
  cardNumber: string;
  playerName: string;
  team: string;
  isRookieCard: boolean;
}

interface ManualParallel {
  name: string;
  printRun: string;
  serialNumbered: boolean;
  colorFamily: string;
}

function ManualEntrySection() {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [manufacturer, setManufacturer] = useState("Topps");
  const [baseSetSize, setBaseSetSize] = useState("");
  const [cards, setCards] = useState<ManualCard[]>([
    { cardNumber: "", playerName: "", team: "", isRookieCard: false },
  ]);
  const [parallels, setParallels] = useState<ManualParallel[]>([
    { name: "Base", printRun: "", serialNumbered: false, colorFamily: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    cardsUpserted: number;
    parallelsUpserted: number;
    error?: string;
  } | null>(null);

  const addCard = () => {
    setCards((prev) => [
      ...prev,
      { cardNumber: "", playerName: "", team: "", isRookieCard: false },
    ]);
  };

  const removeCard = (idx: number) => {
    setCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCard = (idx: number, field: keyof ManualCard, value: string | boolean) => {
    setCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  };

  const addParallel = () => {
    setParallels((prev) => [
      ...prev,
      { name: "", printRun: "", serialNumbered: false, colorFamily: "" },
    ]);
  };

  const removeParallel = (idx: number) => {
    setParallels((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateParallel = (idx: number, field: keyof ManualParallel, value: string | boolean) => {
    setParallels((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !year) return;
    setSaving(true);
    setResult(null);

    const validCards = cards.filter((c) => c.cardNumber && c.playerName);
    const validParallels = parallels.filter((p) => p.name);

    const res = await manualAddSetProduct({
      name,
      year: parseInt(year),
      manufacturer,
      baseSetSize: baseSetSize ? parseInt(baseSetSize) : undefined,
      cards: validCards,
      parallels: validParallels.map((p) => ({
        name: p.name,
        printRun: p.printRun ? parseInt(p.printRun) : undefined,
        serialNumbered: p.serialNumbered,
        colorFamily: p.colorFamily || undefined,
      })),
    });

    setResult(res);
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Manual Entry</CardTitle>
        <CardDescription>
          Add a set product with cards and parallels manually, for when TCDB
          doesn&apos;t have the data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Product Info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Product Name *
            </label>
            <Input
              placeholder="e.g. Topps Series 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Year *
            </label>
            <Input
              type="number"
              placeholder="2026"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Manufacturer
            </label>
            <Input
              placeholder="Topps"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Base Set Size
            </label>
            <Input
              type="number"
              placeholder="330"
              value={baseSetSize}
              onChange={(e) => setBaseSetSize(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Cards */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Cards
            </label>
            <Button variant="ghost" size="sm" onClick={addCard} className="h-7 px-2 text-xs gap-1">
              <Plus className="h-3 w-3" /> Add Card
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {cards.map((card, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="#"
                  value={card.cardNumber}
                  onChange={(e) => updateCard(idx, "cardNumber", e.target.value)}
                  className="w-16"
                />
                <Input
                  placeholder="Player Name"
                  value={card.playerName}
                  onChange={(e) => updateCard(idx, "playerName", e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Team"
                  value={card.team}
                  onChange={(e) => updateCard(idx, "team", e.target.value)}
                  className="w-40"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={card.isRookieCard}
                    onChange={(e) => updateCard(idx, "isRookieCard", e.target.checked)}
                    className="rounded border-border"
                  />
                  RC
                </label>
                <button
                  onClick={() => removeCard(idx)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Parallels */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Parallels
            </label>
            <Button variant="ghost" size="sm" onClick={addParallel} className="h-7 px-2 text-xs gap-1">
              <Plus className="h-3 w-3" /> Add Parallel
            </Button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {parallels.map((parallel, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="Name (e.g. Gold /2026)"
                  value={parallel.name}
                  onChange={(e) => updateParallel(idx, "name", e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Print run"
                  type="number"
                  value={parallel.printRun}
                  onChange={(e) => updateParallel(idx, "printRun", e.target.value)}
                  className="w-24"
                />
                <Input
                  placeholder="Color"
                  value={parallel.colorFamily}
                  onChange={(e) => updateParallel(idx, "colorFamily", e.target.value)}
                  className="w-24"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={parallel.serialNumbered}
                    onChange={(e) => updateParallel(idx, "serialNumbered", e.target.checked)}
                    className="rounded border-border"
                  />
                  S/N
                </label>
                <button
                  onClick={() => removeParallel(idx)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !year}
            className="gap-2"
            style={{ backgroundColor: "var(--color-burg)", color: "white" }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {saving ? "Saving..." : "Add Set Product"}
          </Button>
        </div>

        {/* Result */}
        {result && (
          <div
            className={`rounded-md border p-3 text-sm ${
              result.success
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {result.success ? (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                <span>
                  Saved: <strong>{result.cardsUpserted}</strong> cards and{" "}
                  <strong>{result.parallelsUpserted}</strong> parallels.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{result.error || "Save failed."}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ReferenceImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl font-light tracking-wide text-white"
          >
            Reference Database Import
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Import card checklists from TCDB or add set data manually.
          </p>
        </div>
      </div>

      <TcdbImportSection />
      <ManualEntrySection />
    </div>
  );
}
