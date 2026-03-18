"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, X } from "lucide-react";

export function CardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || "";
  const year = searchParams.get("year") || "";
  const status = searchParams.get("status") || "";

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/cards?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = () => {
    router.push("/cards");
  };

  const hasFilters = search || year || status;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by player, set, or card number..."
          value={search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Year filter */}
      <Input
        placeholder="Year"
        value={year}
        onChange={(e) => updateFilter("year", e.target.value)}
        className="w-24"
        type="number"
      />

      {/* Status filter */}
      <select
        value={status}
        onChange={(e) => updateFilter("status", e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">All Status</option>
        <option value="in_collection">In Collection</option>
        <option value="for_sale">For Sale</option>
        <option value="sold">Sold</option>
        <option value="traded">Traded</option>
      </select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
