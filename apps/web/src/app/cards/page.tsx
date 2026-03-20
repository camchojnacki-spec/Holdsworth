import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardFilters } from "@/components/cards/card-filters";
import { CardBinderGrid } from "@/components/cards/card-binder-grid";
import { Plus, ScanLine, Library, ChevronLeft, ChevronRight, Trash2, Layers } from "lucide-react";
import { Suspense } from "react";
import { getCards, getDeletedCardCount, getCollectionVerificationStats } from "@/actions/cards";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; year?: string; status?: string; sortBy?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1") || 1;
  const [{ cards, totalCount, pageSize }, deletedCount, verificationStats] = await Promise.all([
    getCards({ ...params, page }),
    getDeletedCardCount(),
    getCollectionVerificationStats(),
  ]);
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl sm:text-3xl font-light tracking-wide text-white">
            Binder
          </h1>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] sm:text-xs tracking-wider uppercase text-muted-foreground mt-0.5 sm:mt-1">
            {totalCount} cards in binder
          </p>
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <Link href="/scan">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3">
              <ScanLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Scan</span>
            </Button>
          </Link>
          <Link href="/cards/new">
            <Button size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Catalogue</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Verification stats bar */}
      {verificationStats.total > 0 && (
        <div className="flex items-center gap-3 sm:gap-5 overflow-x-auto pb-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground">
              {verificationStats.total} total
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-green)]" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-[var(--color-green-light)]">
              {verificationStats.verified} verified
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-blue-300">
              {verificationStats.corrected} corrected
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider text-muted-foreground">
              {verificationStats.aiOnly} AI only
            </span>
          </div>
        </div>
      )}

      <Suspense>
        <CardFilters />
      </Suspense>

      {cards.length > 0 ? (
        <>
          <CardBinderGrid cards={cards} totalCount={totalCount} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              {page > 1 ? (
                <Link href={{ query: { ...params, page: String(page - 1) } }}>
                  <Button variant="outline" size="sm"><ChevronLeft className="h-4 w-4" /></Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled><ChevronLeft className="h-4 w-4" /></Button>
              )}
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-wider text-muted-foreground px-3">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={{ query: { ...params, page: String(page + 1) } }}>
                  <Button variant="outline" size="sm"><ChevronRight className="h-4 w-4" /></Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled><ChevronRight className="h-4 w-4" /></Button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Library className="h-16 w-16 mb-4 opacity-20" />
          <h2 style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-white">
            Your Binder is Empty
          </h2>
          <p className="text-sm mt-2 mb-6">Pull your first card to start building your collection</p>
          <div className="flex gap-3">
            <Link href="/scan">
              <Button variant="outline" className="gap-2">
                <ScanLine className="h-4 w-4" />
                Scan
              </Button>
            </Link>
            <Link href="/cards/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Manually
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Recycle Bin link */}
      {deletedCount > 0 && (
        <div className="flex justify-center pt-2 pb-4">
          <Link href="/cards/deleted">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-[var(--color-burg-light)]">
              <Trash2 className="h-3.5 w-3.5" />
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-wider">
                Recycle Bin ({deletedCount})
              </span>
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
