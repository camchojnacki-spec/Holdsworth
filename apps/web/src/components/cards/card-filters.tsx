"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Download, ArrowUpDown } from "lucide-react";

export function CardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") || "";
  const year = searchParams.get("year") || "";
  const status = searchParams.get("status") || "";
  const sortBy = searchParams.get("sortBy") || "";

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset to page 1 when filters change
      params.delete("page");
      router.push(`/cards?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = () => {
    router.push("/cards");
  };

  const handleExport = () => {
    const params = new URLSearchParams(searchParams.toString());
    window.open(`/api/export?${params.toString()}`, "_blank");
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

      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => updateFilter("sortBy", e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">Newest</option>
        <option value="name">Player A–Z</option>
        <option value="year">Year ↓</option>
        <option value="value">Value ↓</option>
      </select>

      {/* Export */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExport}
        className="gap-1 text-muted-foreground hover:text-white"
        title="Export to CSV"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
