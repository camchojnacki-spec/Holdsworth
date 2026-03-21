"use client";

import { useState, useEffect, useTransition } from "react";
import { getVendorAvailability } from "@/actions/vendors";
import { ExternalLink, Package, Loader2, Store, ChevronDown, ChevronUp } from "lucide-react";

interface CardVendorsProps {
  cardId: string;
}

type VendorProduct = Awaited<ReturnType<typeof getVendorAvailability>>[number];

export function CardVendors({ cardId }: CardVendorsProps) {
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVendorAvailability(cardId)
      .then((results) => {
        if (!cancelled) {
          setProducts(results);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [cardId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking vendor availability...
      </div>
    );
  }

  if (products.length === 0) return null;

  const inStockProducts = products.filter((p) => p.inStock);
  const displayProducts = expanded ? products : inStockProducts.slice(0, 3);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-white transition-colors"
      >
        <Store className="h-3.5 w-3.5" />
        <span style={{ fontFamily: "var(--font-mono)" }} className="tracking-wider uppercase">
          Where to Buy ({inStockProducts.length} in stock)
        </span>
        {products.length > 3 && (
          expanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {(expanded || inStockProducts.length > 0) && (
        <div className="space-y-1.5">
          {displayProducts.map((p, i) => (
            <a
              key={i}
              href={p.productUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-sm hover:bg-accent/20 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium truncate">
                    {p.vendorName}
                  </span>
                  {p.vendorCountry === "Canada" && (
                    <span className="text-[9px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-sm">
                      🇨🇦 CA
                    </span>
                  )}
                  {!p.inStock && (
                    <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded-sm">
                      Out of Stock
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.productName}
                  {p.productType && (
                    <span className="ml-1.5 text-[10px] opacity-70">
                      ({p.productType.replace(/_/g, " ")})
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {p.totalLandedCad ? (
                  <>
                    <div className="text-white font-medium">
                      ${parseFloat(p.totalLandedCad).toFixed(2)} CAD
                    </div>
                    <div className="text-[10px] text-muted-foreground">landed</div>
                  </>
                ) : p.priceCad ? (
                  <div className="text-white font-medium">
                    ${parseFloat(p.priceCad).toFixed(2)} CAD
                  </div>
                ) : p.priceUsd ? (
                  <div className="text-white font-medium">
                    ${parseFloat(p.priceUsd).toFixed(2)} USD
                  </div>
                ) : null}
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
