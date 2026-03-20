import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardFilters } from "@/components/cards/card-filters";
import { CardGridItem } from "@/components/cards/card-grid-item";
import { Plus, ScanLine, Library, ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { getCards } from "@/actions/cards";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; year?: string; status?: string; sortBy?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1") || 1;
  const { cards, totalCount, pageSize } = await getCards({ ...params, page });
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
            Binder
          </h1>
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-wider uppercase text-muted-foreground mt-1">
            {totalCount} cards in binder
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/scan">
            <Button variant="outline" className="gap-2">
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
          </Link>
          <Link href="/cards/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Catalogue
            </Button>
          </Link>
        </div>
      </div>

      <Suspense>
        <CardFilters />
      </Suspense>

      {cards.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {cards.map((card) => (
              <CardGridItem key={card.id} card={card} />
            ))}
          </div>

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
    </div>
  );
}
