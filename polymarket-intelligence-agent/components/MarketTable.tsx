import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

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
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
  pagination?: PaginationMeta;
  onPrevPage: () => void;
  onNextPage: () => void;
}

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
  searchValue,
  onSearchValueChange,
  onSearchSubmit,
  onSearchClear,
  pagination,
  onPrevPage,
  onNextPage,
}: MarketTableProps) {
  const allOnPageSelected =
    markets.length > 0 && markets.every((m) => selectedMarketIds.has(m.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>Live Market Overview</CardTitle>
          <form
            className="flex w-full max-w-xl items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
          >
            <input
              value={searchValue}
              onChange={(e) => onSearchValueChange(e.target.value)}
              placeholder="Search live markets"
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
              aria-label="Live market overview search"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onSearchClear}
            >
              Clear
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={(e) => onTogglePage(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            Select all on this page
          </label>
          <span>{selectedMarketIds.size} selected</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Pick</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Probability</TableHead>
              <TableHead>Price Change</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Liquidity</TableHead>
              <TableHead>AI Action</TableHead>
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
              const change = priceChanges[market.id] ?? 0;
              const isUp = change > 0;
              const isDown = change < 0;
              const isSelected = selectedMarketIds.has(market.id);

              return (
                <TableRow
                  key={market.id}
                  className={isSelected ? "bg-slate-800/30" : undefined}
                  onClick={() => onOpenMarketDetails(market)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        onToggleMarket(market.id, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                    />
                  </TableCell>
                  <TableCell className="max-w-90 cursor-pointer font-medium text-slate-200">
                    {market.question}
                  </TableCell>
                  <TableCell>{formatPercent(market.probability)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        isUp
                          ? "inline-flex items-center gap-1 text-emerald-300"
                          : isDown
                            ? "inline-flex items-center gap-1 text-rose-300"
                            : "inline-flex items-center gap-1 text-slate-400"
                      }
                    >
                      {isUp ? <ArrowUpRight className="h-4 w-4" /> : null}
                      {isDown ? <ArrowDownRight className="h-4 w-4" /> : null}
                      {!isUp && !isDown ? <Minus className="h-4 w-4" /> : null}
                      {`${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`}
                    </span>
                  </TableCell>
                  <TableCell>${formatVolume(market.volume)}</TableCell>
                  <TableCell>${formatVolume(market.liquidity)}</TableCell>
                  <TableCell>
                    <ActionBadge action={actionsByMarket[market.question]} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

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
