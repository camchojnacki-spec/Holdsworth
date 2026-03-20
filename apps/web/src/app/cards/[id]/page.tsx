import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil } from "lucide-react";
import { getCardById } from "@/actions/cards";
import { DeleteCardButton } from "@/components/cards/delete-card-button";
import { CardComps } from "@/components/cards/card-comps";
import { CardGrade } from "@/components/cards/card-grade";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCardById(id);

  if (!card) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/cards">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light tracking-wide text-white">
              {card.playerName ?? "Unknown Player"}
            </h1>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] tracking-wider uppercase text-muted-foreground mt-1">
              {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/cards/${card.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />Edit
            </Button>
          </Link>
          <DeleteCardButton cardId={card.id} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-3">
            {card.originalUrl ? (
              <img src={card.originalUrl} alt={card.playerName ?? "Card front"} className="w-full rounded-lg" />
            ) : (
              <div className="flex items-center justify-center h-64 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground">No photo</p>
              </div>
            )}
            {card.backPhotoUrl && (
              <details className="group">
                <summary style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground cursor-pointer hover:text-[var(--color-burg-light)] transition-colors">
                  View Back
                </summary>
                <img
                  src={card.backPhotoUrl}
                  alt={`${card.playerName ?? "Card"} back`}
                  className="w-full rounded-lg mt-2"
                />
              </details>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Identification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Player" value={card.playerName} />
              <Field label="Team" value={card.playerTeam} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year" value={card.year?.toString()} />
                <Field label="Card #" value={card.cardNumber} />
              </div>
              <Field label="Set" value={card.setName} />
              <Field label="Manufacturer" value={card.manufacturerName} />
              {card.parallelVariant && <Field label="Parallel" value={card.parallelVariant} highlight />}
              {card.subsetOrInsert && <Field label="Insert Set" value={card.subsetOrInsert} />}

              <div className="flex flex-wrap gap-1.5 pt-2">
                {card.isRookieCard && <Badge variant="default">RC</Badge>}
                {card.isAutograph && <Badge variant="default">Auto</Badge>}
                {card.graded && <Badge variant="secondary">{card.gradingCompany} {card.grade}</Badge>}
                {card.aiCorrected && <Badge variant="secondary">Confirmed</Badge>}
              </div>
            </CardContent>
          </Card>

          <CardGrade
            cardId={card.id}
            condition={card.condition}
            conditionNotes={card.conditionNotes}
            graded={card.graded}
            gradingCompany={card.gradingCompany}
            grade={card.grade}
          />
        </div>
      </div>

      {/* Market Comps — reads cached data from DB */}
      <CardComps cardId={card.id} />

      {(card.purchasePrice || card.purchaseSource) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Acquisition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {card.purchasePrice && (
              <Field label="Purchase Price" value={`$${card.purchasePrice} ${card.purchaseCurrency}`} />
            )}
            {card.purchaseSource && <Field label="Source" value={card.purchaseSource} />}
            {card.purchaseDate && <Field label="Purchase Date" value={card.purchaseDate.toLocaleDateString()} />}
          </CardContent>
        </Card>
      )}

      {card.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{card.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">{label}</label>
      <p className={`text-sm ${highlight ? "text-[var(--color-burg-light)]" : "text-white"}`}>{value}</p>
    </div>
  );
}
