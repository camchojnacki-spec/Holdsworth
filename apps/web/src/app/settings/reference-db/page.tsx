"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  Database,
  Layers,
  Users,
  Package,
  ChevronRight,
  Calendar,
  Hash,
  Star,
  Loader2,
  X,
  Palette,
  Trophy,
  Sparkles,
  Pen,
} from "lucide-react";
import {
  getReferenceDbStats,
  getSetProducts,
  getSetDetails,
  searchReferenceDb,
} from "@/actions/reference-db";

// ── Types ──

type Stats = Awaited<ReturnType<typeof getReferenceDbStats>>;
type SetProduct = Awaited<ReturnType<typeof getSetProducts>>[number];
type SetDetails = NonNullable<Awaited<ReturnType<typeof getSetDetails>>>;
type SearchResult = Awaited<ReturnType<typeof searchReferenceDb>>[number];

// ── Main Page ──

export default function ReferenceDbPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sets, setSets] = useState<SetProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [setDetails, setSetDetails] = useState<SetDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Load initial data
  useEffect(() => {
    Promise.all([getReferenceDbStats(), getSetProducts()]).then(
      ([s, p]) => {
        setStats(s);
        setSets(p);
        setLoading(false);
      }
    );
  }, []);

  // Drill into a set
  const openSet = useCallback(async (id: string) => {
    setSelectedSetId(id);
    setDetailsLoading(true);
    const details = await getSetDetails(id);
    setSetDetails(details);
    setDetailsLoading(false);
  }, []);

  const closeSet = useCallback(() => {
    setSelectedSetId(null);
    setSetDetails(null);
  }, []);

  // Global search with debounce
  useEffect(() => {
    if (globalSearch.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const results = await searchReferenceDb(globalSearch);
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [globalSearch]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Set Detail View ──
  if (selectedSetId && setDetails) {
    return <SetDetailView details={setDetails} onBack={closeSet} loading={detailsLoading} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-[var(--color-burg-light)]">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl sm:text-3xl font-light tracking-wide text-white"
          >
            Reference Database
          </h1>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground mt-0.5"
          >
            Master card checklist &amp; parallel data
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/settings/reference-db/import">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Database className="h-3 w-3" />
              Import
            </Button>
          </Link>
          <Link href="/settings/reference-db/feedback">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Sparkles className="h-3 w-3" />
              Feedback
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Package} label="Sets" value={stats.sets} />
          <StatCard icon={Database} label="Cards" value={stats.cards} />
          <StatCard icon={Layers} label="Parallels" value={stats.parallels} />
          <StatCard icon={Users} label="Players" value={stats.players} />
        </div>
      )}

      {/* Global Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search cards by player, card number, or set name..."
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          className="pl-10 h-10"
        />
        {globalSearch && (
          <button
            onClick={() => setGlobalSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults !== null ? (
        <SearchResultsView
          results={searchResults}
          searching={searching}
          query={globalSearch}
          onSelectSet={openSet}
        />
      ) : (
        /* Set Product Grid */
        <SetGrid sets={sets} onSelect={openSet} />
      )}
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-burg)]/20">
          <Icon className="h-4 w-4 text-[var(--color-burg-light)]" />
        </div>
        <div>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-lg font-semibold text-white leading-tight"
          >
            {value.toLocaleString()}
          </p>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] tracking-wider uppercase text-muted-foreground"
          >
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Set Grid ──

function SetGrid({
  sets,
  onSelect,
}: {
  sets: SetProduct[];
  onSelect: (id: string) => void;
}) {
  if (sets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Database className="h-16 w-16 mb-4 opacity-20" />
        <h2
          style={{ fontFamily: "var(--font-display)" }}
          className="text-2xl font-light text-white"
        >
          No Sets in Database
        </h2>
        <p className="text-sm mt-2">
          Run the scraper to populate the reference database
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sets.map((set) => (
        <button
          key={set.id}
          onClick={() => onSelect(set.id)}
          className="text-left group"
        >
          <Card className="h-full transition-colors hover:border-[var(--color-burg-light)]/40 hover:bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-medium text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">
                    {set.year} {set.name}
                  </CardTitle>
                  {set.manufacturerName && (
                    <p
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground mt-1"
                    >
                      {set.manufacturerName}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-[var(--color-burg-light)] transition-colors" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Hash className="h-3 w-3" />
                  {set.cardCount} cards
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Palette className="h-3 w-3" />
                  {set.parallelCount} variants
                </Badge>
              </div>
              {set.lastScrapedAt && (
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-[10px] tracking-wider text-muted-foreground mt-2.5 flex items-center gap-1"
                >
                  <Calendar className="h-3 w-3" />
                  Scraped{" "}
                  {new Date(set.lastScrapedAt).toLocaleDateString("en-CA", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

// ── Search Results ──

function SearchResultsView({
  results,
  searching,
  query,
  onSelectSet,
}: {
  results: SearchResult[];
  searching: boolean;
  query: string;
  onSelectSet: (id: string) => void;
}) {
  if (searching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Search className="h-10 w-10 mb-3 opacity-20" />
        <p className="text-sm">
          No results for &ldquo;{query}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p
        style={{ fontFamily: "var(--font-mono)" }}
        className="text-[10px] tracking-wider uppercase text-muted-foreground"
      >
        {results.length} result{results.length !== 1 ? "s" : ""}{results.length >= 100 ? " (limited)" : ""}
      </p>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60">
              <th
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5"
              >
                Card #
              </th>
              <th
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5"
              >
                Player
              </th>
              <th
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 hidden sm:table-cell"
              >
                Team
              </th>
              <th
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5"
              >
                Set
              </th>
              <th
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 hidden md:table-cell"
              >
                Flags
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/50 last:border-0 hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => onSelectSet(r.setProductId)}
              >
                <td
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="px-4 py-2.5 text-xs text-muted-foreground"
                >
                  {r.cardNumber}
                </td>
                <td className="px-4 py-2.5 text-white font-medium">
                  {r.playerName}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                  {r.team ?? "-"}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-muted-foreground">
                    {r.setYear} {r.setName}
                  </span>
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  <div className="flex gap-1">
                    {r.isRookieCard && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-yellow-400 border-yellow-400/30">
                        RC
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Set Detail View ──

function SetDetailView({
  details,
  onBack,
  loading,
}: {
  details: SetDetails;
  onBack: () => void;
  loading: boolean;
}) {
  const [cardSearch, setCardSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"checklist" | "parallels" | "subsets">("checklist");

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { product, cards, parallels, subsets: setSubsets } = details;

  const filteredCards = cardSearch.trim()
    ? cards.filter(
        (c) =>
          c.playerName.toLowerCase().includes(cardSearch.toLowerCase()) ||
          c.cardNumber.toLowerCase().includes(cardSearch.toLowerCase()) ||
          (c.team ?? "").toLowerCase().includes(cardSearch.toLowerCase())
      )
    : cards;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 text-muted-foreground hover:text-[var(--color-burg-light)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl sm:text-3xl font-light tracking-wide text-white"
          >
            {product.year} {product.name}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {product.manufacturerName && (
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground"
              >
                {product.manufacturerName}
              </p>
            )}
            {product.sport && (
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] tracking-wider uppercase text-muted-foreground"
              >
                {product.sport}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Hash className="h-3 w-3" />
          {cards.length} cards
        </Badge>
        <Badge variant="secondary" className="gap-1 text-xs">
          <Palette className="h-3 w-3" />
          {parallels.length} parallels
        </Badge>
        {setSubsets.length > 0 && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Layers className="h-3 w-3" />
            {setSubsets.length} subsets
          </Badge>
        )}
        {product.baseSetSize && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Package className="h-3 w-3" />
            {product.baseSetSize} base set
          </Badge>
        )}
        {product.lastScrapedAt && (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Scraped{" "}
            {new Date(product.lastScrapedAt).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton
          active={activeTab === "checklist"}
          onClick={() => setActiveTab("checklist")}
          label={`Checklist (${cards.length})`}
        />
        <TabButton
          active={activeTab === "parallels"}
          onClick={() => setActiveTab("parallels")}
          label={`Parallels (${parallels.length})`}
        />
        {setSubsets.length > 0 && (
          <TabButton
            active={activeTab === "subsets"}
            onClick={() => setActiveTab("subsets")}
            label={`Subsets (${setSubsets.length})`}
          />
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "checklist" && (
        <div className="space-y-3">
          {/* Search within set */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search within this set..."
              value={cardSearch}
              onChange={(e) => setCardSearch(e.target.value)}
              className="pl-10 h-9"
            />
            {cardSearch && (
              <button
                onClick={() => setCardSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {cardSearch && (
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              {filteredCards.length} result{filteredCards.length !== 1 ? "s" : ""}
            </p>
          )}

          {/* Checklist Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/60">
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 w-20"
                    >
                      #
                    </th>
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5"
                    >
                      Player
                    </th>
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 hidden sm:table-cell"
                    >
                      Team
                    </th>
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 hidden md:table-cell"
                    >
                      Position
                    </th>
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5 hidden lg:table-cell"
                    >
                      Subset
                    </th>
                    <th
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground font-normal text-left px-4 py-2.5"
                    >
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCards.map((card) => (
                    <tr
                      key={card.id}
                      className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                    >
                      <td
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="px-4 py-2 text-xs text-muted-foreground"
                      >
                        {card.cardNumber}
                      </td>
                      <td className="px-4 py-2 text-white font-medium">
                        {card.playerName}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">
                        {card.team ?? "-"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                        {card.position ?? "-"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden lg:table-cell text-xs">
                        {card.subsetName ?? "Base"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {card.isRookieCard && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-yellow-400 border-yellow-400/30 gap-0.5"
                            >
                              <Star className="h-2.5 w-2.5" />
                              RC
                            </Badge>
                          )}
                          {card.isAutograph && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-blue-400 border-blue-400/30 gap-0.5"
                            >
                              <Pen className="h-2.5 w-2.5" />
                              AUTO
                            </Badge>
                          )}
                          {card.isRelic && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30 gap-0.5"
                            >
                              <Trophy className="h-2.5 w-2.5" />
                              RELIC
                            </Badge>
                          )}
                          {card.isShortPrint && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-red-400 border-red-400/30 gap-0.5"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              SP
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCards.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        No cards match your search
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "parallels" && (
        <div className="space-y-3">
          {parallels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Palette className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No parallel data for this set</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {parallels.map((p) => (
                <Card key={p.id} className="bg-card/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {p.name}
                        </p>
                        {p.subsetName && (
                          <p
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground mt-0.5"
                          >
                            {p.subsetName}
                          </p>
                        )}
                      </div>
                      {p.serialNumbered && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 text-[var(--color-burg-light)] border-[var(--color-burg)]/40"
                        >
                          SERIAL #
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {p.printRun && (
                        <div className="flex items-center justify-between">
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground"
                          >
                            Print Run
                          </span>
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-xs text-white"
                          >
                            /{p.printRun}
                          </span>
                        </div>
                      )}
                      {p.priceMultiplier && (
                        <div className="flex items-center justify-between">
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground"
                          >
                            Price Multiplier
                          </span>
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-xs text-[var(--color-burg-light)]"
                          >
                            {p.priceMultiplier}x
                          </span>
                        </div>
                      )}
                      {p.colorFamily && (
                        <div className="flex items-center justify-between">
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground"
                          >
                            Color
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {p.colorFamily}
                          </span>
                        </div>
                      )}
                      {p.finishType && (
                        <div className="flex items-center justify-between">
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground"
                          >
                            Finish
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {p.finishType}
                          </span>
                        </div>
                      )}
                      {p.exclusiveTo && (
                        <div className="flex items-center justify-between">
                          <span
                            style={{ fontFamily: "var(--font-mono)" }}
                            className="text-[10px] tracking-wider uppercase text-muted-foreground"
                          >
                            Exclusive
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {p.exclusiveTo}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "subsets" && (
        <div className="space-y-3">
          {setSubsets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Layers className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No subset data for this set</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {setSubsets.map((s) => (
                <Card key={s.id} className="bg-card/50">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-white">{s.name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {s.subsetType}
                      </Badge>
                      {s.totalCards && (
                        <span
                          style={{ fontFamily: "var(--font-mono)" }}
                          className="text-[10px] tracking-wider text-muted-foreground"
                        >
                          {s.totalCards} cards
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {s.isAutograph && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 text-blue-400 border-blue-400/30 gap-0.5 mr-1"
                        >
                          <Pen className="h-2.5 w-2.5" />
                          AUTO
                        </Badge>
                      )}
                      {s.isRelic && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30 gap-0.5"
                        >
                          <Trophy className="h-2.5 w-2.5" />
                          RELIC
                        </Badge>
                      )}
                    </div>
                    {s.numberingPattern && (
                      <p
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[10px] tracking-wider text-muted-foreground mt-2"
                      >
                        Pattern: {s.numberingPattern}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab Button ──

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{ fontFamily: "var(--font-mono)" }}
      className={`text-[11px] tracking-wider uppercase px-4 py-2.5 border-b-2 transition-colors ${
        active
          ? "border-[var(--color-burg-light)] text-[var(--color-burg-light)]"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
