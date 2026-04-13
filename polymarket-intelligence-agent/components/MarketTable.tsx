import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  LayoutGrid,
  List,
  Minus,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Market, PaginationMeta } from "@/lib/types";
import { formatPercent, formatVolume } from "@/lib/utils";

interface MarketTableProps {
  markets: Market[];
  priceChanges: Record<string, number>;
  actionsByMarket: Record<string, "BUY" | "SELL" | "MONITOR" | undefined>;
  selectedMarketIds: Set<string>;
  onToggleMarket: (marketId: string, selected: boolean) => void;
  onTogglePage: (selected: boolean) => void;
  onOpenMarketDetails: (market: Market) => void;
  pagination?: PaginationMeta;
  onPrevPage: () => void;
  onNextPage: () => void;
  signalsFilterActive?: boolean;
  onSignalsFilterChange?: (v: boolean) => void;
  onCategoryFilter?: (keyword: string) => void;
}

type MarketViewMode = "grid" | "table";

function ActionBadge({
  action,
}: {
  action: "BUY" | "SELL" | "MONITOR" | undefined;
}) {
  if (!action) return <Badge variant="neutral">N/A</Badge>;
  if (action === "BUY") return <Badge variant="buy">BUY</Badge>;
  if (action === "SELL") return <Badge variant="sell">SELL</Badge>;
  return <Badge variant="monitor">MONITOR</Badge>;
}

export function MarketTable({
  markets,
  priceChanges,
  actionsByMarket,
  selectedMarketIds,
  onToggleMarket,
  onTogglePage,
  onOpenMarketDetails,
  pagination,
  onPrevPage,
  onNextPage,
  signalsFilterActive = false,
  onSignalsFilterChange,
  onCategoryFilter,
}: MarketTableProps) {
  const [viewMode, setViewMode] = useState<MarketViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState("All");
  const allOnPageSelected =
    markets.length > 0 && markets.every((m) => selectedMarketIds.has(m.id));

  const formatSharePrice = (probability: number) =>
    `$${probability.toFixed(2)}`;

  const summary = useMemo(() => {
    const selected = markets.filter((m) => selectedMarketIds.has(m.id));
    const avgProbability =
      selected.length === 0
        ? 0
        : selected.reduce((acc, m) => acc + m.probability, 0) / selected.length;
    return {
      selectedCount: selected.length,
      avgProbability,
    };
  }, [markets, selectedMarketIds]);

  const formatExpiry = (market: Market) => {
    if (!market.endDate) return "No expiry";
    const date = new Date(market.endDate);
    if (Number.isNaN(date.getTime())) return "No expiry";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const txnsEstimate = (market: Market) => {
    const value = Math.max(50, Math.round(market.volume / 1200));
    return value.toLocaleString();
  };

  const miniBarHeight = (market: Market) => {
    const magnitude = Math.max(
      8,
      Math.min(38, Math.round(market.probability * 40)),
    );
    return `${magnitude}px`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-slate-100">Markets</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Explore in cards or operational table mode.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "outline"}
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={(e) => onTogglePage(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            Select all on this page
          </label>
          <div className="flex items-center gap-2">
            <span>{selectedMarketIds.size} selected</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
              Avg: {formatPercent(summary.avgProbability)}
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {["All", "Politics", "Sports", "Crypto", "Elections"].map((tag) => {
            const isActive = activeCategory === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveCategory(tag);
                  onCategoryFilter?.(tag === "All" ? "" : tag.toLowerCase());
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  isActive
                    ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </span>
        </div>

        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={signalsFilterActive}
            onChange={(e) => onSignalsFilterChange?.(e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-400"
          />
          Show only markets with signals
        </label>

        {viewMode === "grid" ? (
          markets.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
              No markets found for the selected query.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {markets.map((market) => {
                const change = priceChanges[market.id] ?? 0;
                const isUp = change > 0;
                const isDown = change < 0;
                const isSelected = selectedMarketIds.has(market.id);
                const yesPrice =
                  market.outcomePrices?.[0] ?? market.probability;
                const noPrice =
                  market.outcomePrices?.[1] ?? 1 - market.probability;

                return (
                  <article
                    key={market.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? "border-cyan-500/40 bg-slate-800/40"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenMarketDetails(market)}
                        className="line-clamp-2 text-left text-sm font-medium text-slate-100 hover:text-cyan-300"
                      >
                        {market.question}
                      </button>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          onToggleMarket(market.id, e.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900"
                        aria-label={`Select ${market.question}`}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        YES price (% / $)
                      </p>
                      <p className="text-lg font-semibold text-slate-100">
                        {(market.probability * 100).toFixed(0)}% (
                        {formatSharePrice(market.probability)})
                      </p>
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-xs">
                      <span
                        className={
                          isUp
                            ? "inline-flex items-center gap-1 text-emerald-300"
                            : isDown
                              ? "inline-flex items-center gap-1 text-rose-300"
                              : "inline-flex items-center gap-1 text-slate-400"
                        }
                      >
                        {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
                        {isDown ? (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        ) : null}
                        {!isUp && !isDown ? (
                          <Minus className="h-3.5 w-3.5" />
                        ) : null}
                        {`${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-100"
                        onClick={() => onOpenMarketDetails(market)}
                      >
                        Yes {formatSharePrice(yesPrice)} (
                        {(yesPrice * 100).toFixed(0)}%)
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200"
                        onClick={() => onOpenMarketDetails(market)}
                      >
                        No {formatSharePrice(noPrice)} (
                        {(noPrice * 100).toFixed(0)}%)
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                      <span>${formatVolume(market.volume)} vol</span>
                      <ActionBadge action={actionsByMarket[market.question]} />
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="w-14">Pick</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="w-20">Chart</TableHead>
                  <TableHead className="w-36">30M Volume</TableHead>
                  <TableHead className="w-24">Txns</TableHead>
                  <TableHead className="w-28">Expires</TableHead>
                  <TableHead className="w-36">Trade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-6 text-center text-sm text-slate-400"
                    >
                      No markets found for the selected query.
                    </TableCell>
                  </TableRow>
                ) : null}
                {markets.map((market) => {
                  const isSelected = selectedMarketIds.has(market.id);
                  const yesPrice =
                    market.outcomePrices?.[0] ?? market.probability;
                  const noPrice =
                    market.outcomePrices?.[1] ?? 1 - market.probability;
                  return (
                    <TableRow
                      key={market.id}
                      className={`border-slate-800 hover:bg-slate-900/60 ${
                        isSelected ? "bg-cyan-500/10" : ""
                      }`}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) =>
                            onToggleMarket(market.id, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                          aria-label={`Select ${market.question}`}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onOpenMarketDetails(market)}
                          className="line-clamp-2 text-left text-sm font-medium text-slate-200 hover:text-cyan-300"
                        >
                          {market.question}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex h-10 items-end gap-1 rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1">
                          {[0.55, 0.72, market.probability, 0.63].map(
                            (v, idx) => (
                              <span
                                key={`${market.id}-bar-${idx}`}
                                className={`w-2 rounded-sm ${
                                  idx === 2
                                    ? "bg-emerald-500/90"
                                    : "bg-slate-600"
                                }`}
                                style={{
                                  height:
                                    idx === 2
                                      ? miniBarHeight(market)
                                      : `${Math.round(v * 28)}px`,
                                }}
                              />
                            ),
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-200">
                        ${formatVolume(market.volume)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        <div className="inline-flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                          {txnsEstimate(market)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {formatExpiry(market)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200"
                            onClick={() => onOpenMarketDetails(market)}
                          >
                            Yes {formatSharePrice(yesPrice)} (
                            {Math.round(yesPrice * 100)}%)
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-200"
                            onClick={() => onOpenMarketDetails(market)}
                          >
                            No {formatSharePrice(noPrice)} (
                            {Math.round(noPrice * 100)}%)
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {pagination ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
            <p>
              Page {pagination.page} of {pagination.totalPages} •{" "}
              {pagination.total} markets
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onPrevPage}
                disabled={!pagination.hasPrev}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onNextPage}
                disabled={!pagination.hasNext}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
