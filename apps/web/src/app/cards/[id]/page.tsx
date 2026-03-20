import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, Pencil } from "lucide-react";
import { getCardById } from "@/actions/cards";
import { DeleteCardButton } from "@/components/cards/delete-card-button";
import { CardComps } from "@/components/cards/card-comps";
import { CardGrade } from "@/components/cards/card-grade";
import { CardTags } from "@/components/cards/card-tags";
import { EditIdentification } from "@/components/cards/edit-identification";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCardById(id);

  if (!card) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 sm:gap-4 min-w-0">
          <Link href="/cards" className="mt-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 style={{ fontFamily: "var(--font-display)" }} className="text-lg sm:text-2xl font-light tracking-wide text-white truncate">
                {card.playerName ?? "Unknown Player"}
              </h1>
              {card.referenceCardId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-green)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-green-light)] shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
                  Verified
                </span>
              ) : card.aiCorrected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300 shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
                  Corrected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
                  AI Identified
                </span>
              )}
            </div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] sm:text-[11px] tracking-wider uppercase text-muted-foreground mt-0.5">
              {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" · ")}
            </p>
            {card.referenceCardId && card.referenceProductName && (
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-[var(--color-green-light)]/70 mt-0.5">
                Verified against {card.referenceProductYear} {card.referenceProductName} checklist
              </p>
            )}
            {card.aiCorrected && !card.referenceCardId && (
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-blue-300/70 mt-0.5">
                AI Identified — corrections applied
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Link href={`/cards/${card.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1 h-8 px-2 sm:px-3 text-xs">
              <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </Link>
          <DeleteCardButton cardId={card.id} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="self-start">
          <CardContent className="p-3 sm:p-4 space-y-2">
            {card.originalUrl ? (
              <img src={card.originalUrl} alt={card.playerName ?? "Card front"} className="w-full rounded-lg" />
            ) : (
              <div className="flex items-center justify-center h-48 sm:h-64 rounded-lg bg-secondary/30">
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

        <div className="space-y-3 sm:space-y-4">
          <Card>
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <div className="flex items-center justify-between">
                <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-base sm:text-lg font-normal text-white">Identification</CardTitle>
                <EditIdentification
                  cardId={card.id}
                  playerName={card.playerName}
                  setName={card.setName}
                  year={card.year}
                  cardNumber={card.cardNumber}
                  parallelVariant={card.parallelVariant}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
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

              <div className="pt-2">
                <CardTags cardId={card.id} />
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
      <div className="flex items-center justify-between">
        <span />
        <Link href={`/prices/alerts?cardId=${card.id}`}>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs border-[#8B2252]/40 text-[var(--color-burg-light)] hover:bg-[#8B2252]/10">
            <Bell className="h-3 w-3" />
            Set Price Alert
          </Button>
        </Link>
      </div>
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
