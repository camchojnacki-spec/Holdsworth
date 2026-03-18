"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, Upload } from "lucide-react";
import { createCard } from "@/actions/cards";

export default function NewCardPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    playerName: "",
    team: "",
    year: "",
    setName: "",
    manufacturer: "",
    cardNumber: "",
    parallelVariant: "",
    isRookieCard: false,
    condition: "Near Mint",
    conditionNotes: "",
    graded: false,
    gradingCompany: "",
    grade: "",
    quantity: "1",
    purchasePrice: "",
    purchaseCurrency: "CAD",
    purchaseDate: "",
    purchaseSource: "",
    notes: "",
  });

  const updateField = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { id } = await createCard({
        playerName: form.playerName,
        team: form.team || undefined,
        year: form.year ? parseInt(form.year) : undefined,
        setName: form.setName || undefined,
        manufacturer: form.manufacturer || undefined,
        cardNumber: form.cardNumber || undefined,
        parallelVariant: form.parallelVariant || undefined,
        isRookieCard: form.isRookieCard,
        condition: form.condition,
        conditionNotes: form.conditionNotes || undefined,
        graded: form.graded,
        gradingCompany: form.graded ? form.gradingCompany || undefined : undefined,
        grade: form.graded ? form.grade || undefined : undefined,
        quantity: parseInt(form.quantity) || 1,
        purchasePrice: form.purchasePrice || undefined,
        purchaseCurrency: form.purchaseCurrency,
        purchaseDate: form.purchaseDate || undefined,
        purchaseSource: form.purchaseSource || undefined,
        notes: form.notes || undefined,
      });

      router.push(`/cards/${id}`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/cards">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light tracking-wide text-white">Manual Entry</h1>
          <p className="text-muted-foreground text-sm">Catalogue a card by hand</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-base font-normal text-white">Card Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Click to upload or drag and drop</span>
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-2">PNG, JPG up to 20MB</span>
              <input type="file" className="hidden" accept="image/*" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-base font-normal text-white">Identification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Player Name *</label>
                <Input value={form.playerName} onChange={(e) => updateField("playerName", e.target.value)} placeholder="e.g., Mike Trout" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Team</label>
                <Input value={form.team} onChange={(e) => updateField("team", e.target.value)} placeholder="e.g., Los Angeles Angels" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Year</label>
                <Input type="number" value={form.year} onChange={(e) => updateField("year", e.target.value)} placeholder="2024" />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Set</label>
                <Input value={form.setName} onChange={(e) => updateField("setName", e.target.value)} placeholder="Topps Chrome" />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Card #</label>
                <Input value={form.cardNumber} onChange={(e) => updateField("cardNumber", e.target.value)} placeholder="123" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Manufacturer</label>
                <Input value={form.manufacturer} onChange={(e) => updateField("manufacturer", e.target.value)} placeholder="Topps" />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Parallel / Variant</label>
                <Input value={form.parallelVariant} onChange={(e) => updateField("parallelVariant", e.target.value)} placeholder="Refractor /199" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="rookieCard" checked={form.isRookieCard} onChange={(e) => updateField("isRookieCard", e.target.checked)} className="rounded border-border" />
              <label htmlFor="rookieCard" className="text-sm">Rookie Card</label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-base font-normal text-white">Condition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Condition</label>
                <select value={form.condition} onChange={(e) => updateField("condition", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="Gem Mint">Gem Mint</option>
                  <option value="Mint">Mint</option>
                  <option value="Near Mint">Near Mint</option>
                  <option value="Excellent">Excellent</option>
                  <option value="Very Good">Very Good</option>
                  <option value="Good">Good</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Condition Notes</label>
                <Input value={form.conditionNotes} onChange={(e) => updateField("conditionNotes", e.target.value)} placeholder="Any visible flaws..." />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="graded" checked={form.graded} onChange={(e) => updateField("graded", e.target.checked)} className="rounded border-border" />
              <label htmlFor="graded" className="text-sm">Professionally Graded</label>
            </div>

            {form.graded && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Grading Company</label>
                  <select value={form.gradingCompany} onChange={(e) => updateField("gradingCompany", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                    <option value="">Select...</option>
                    <option value="PSA">PSA</option>
                    <option value="BGS">BGS (Beckett)</option>
                    <option value="SGC">SGC</option>
                    <option value="CGC">CGC</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Grade</label>
                  <Input value={form.grade} onChange={(e) => updateField("grade", e.target.value)} placeholder="e.g., 10, 9.5" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-base font-normal text-white">Acquisition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Quantity</label>
                <Input type="number" min="1" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Price Paid</label>
                <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => updateField("purchasePrice", e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Currency</label>
                <select value={form.purchaseCurrency} onChange={(e) => updateField("purchaseCurrency", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Purchase Date</label>
                <Input type="date" value={form.purchaseDate} onChange={(e) => updateField("purchaseDate", e.target.value)} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Source</label>
                <Input value={form.purchaseSource} onChange={(e) => updateField("purchaseSource", e.target.value)} placeholder="eBay, LCS, trade..." />
              </div>
            </div>

            <div>
              <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Notes</label>
              <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Any additional notes about this card..." className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/cards">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={saving || !form.playerName} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Cataloguing..." : "Catalogue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
