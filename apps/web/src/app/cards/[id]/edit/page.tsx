"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { getCardById, updateCard } from "@/actions/cards";
import type { CardWithDetails } from "@/types/cards";

export default function EditCardPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CardWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    getCardById(id).then((c) => {
      if (!c) { router.push("/cards"); return; }
      setCard(c);
      setFields({
        playerName: c.playerName ?? "",
        team: c.playerTeam ?? "",
        year: c.year?.toString() ?? "",
        cardNumber: c.cardNumber ?? "",
        setName: c.setName ?? "",
        manufacturer: c.manufacturerName ?? "",
        parallelVariant: c.parallelVariant ?? "",
        subsetOrInsert: c.subsetOrInsert ?? "",
        condition: c.condition ?? "",
        conditionNotes: c.conditionNotes ?? "",
        purchasePrice: c.purchasePrice ?? "",
        purchaseCurrency: c.purchaseCurrency ?? "CAD",
        purchaseSource: c.purchaseSource ?? "",
        notes: c.notes ?? "",
      });
      setLoading(false);
    });
  }, [id, router]);

  const handleSave = async () => {
    setSaving(true);
    await updateCard(id, {
      playerName: fields.playerName || undefined,
      team: fields.team || undefined,
      year: parseInt(fields.year) || undefined,
      setName: fields.setName || undefined,
      manufacturer: fields.manufacturer || undefined,
      cardNumber: fields.cardNumber,
      parallelVariant: fields.parallelVariant,
      subsetOrInsert: fields.subsetOrInsert,
      condition: fields.condition,
      conditionNotes: fields.conditionNotes,
      purchasePrice: fields.purchasePrice,
      purchaseCurrency: fields.purchaseCurrency,
      purchaseSource: fields.purchaseSource,
      notes: fields.notes,
    });
    router.push(`/cards/${id}`);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/cards/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light tracking-wide text-white">Edit Card</h1>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-1">
            {card?.playerName ?? "Unknown"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditField label="Player Name" value={fields.playerName} onChange={set("playerName")} />
          <EditField label="Team" value={fields.team} onChange={set("team")} />
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Year" value={fields.year} onChange={set("year")} />
            <EditField label="Card #" value={fields.cardNumber} onChange={set("cardNumber")} />
          </div>
          <EditField label="Set" value={fields.setName} onChange={set("setName")} />
          <EditField label="Manufacturer" value={fields.manufacturer} onChange={set("manufacturer")} />
          <EditField label="Parallel" value={fields.parallelVariant} onChange={set("parallelVariant")} />
          <EditField label="Insert Set" value={fields.subsetOrInsert} onChange={set("subsetOrInsert")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Condition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditField label="Condition" value={fields.condition} onChange={set("condition")} />
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Notes</label>
            <textarea
              value={fields.conditionNotes}
              onChange={set("conditionNotes")}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Acquisition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <EditField label="Purchase Price" value={fields.purchasePrice} onChange={set("purchasePrice")} />
            <EditField label="Currency" value={fields.purchaseCurrency} onChange={set("purchaseCurrency")} />
          </div>
          <EditField label="Source" value={fields.purchaseSource} onChange={set("purchaseSource")} />
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Notes</label>
            <textarea
              value={fields.notes}
              onChange={set("notes")}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/cards/${id}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">{label}</label>
      <Input value={value} onChange={onChange} />
    </div>
  );
}
