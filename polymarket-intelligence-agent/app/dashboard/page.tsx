"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";

import { Header } from "@/components/Header";
import { MarketDetailModal } from "@/components/MarketDetailModal";
import { MarketTable } from "@/components/MarketTable";
import { SignalCard } from "@/components/SignalCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Market,
  MarketsResponse,
  PaginationMeta,
  PersistedSignal,
  Signal,
  Strategy,
  StrategyRun,
} from "@/lib/types";

const MARKET_REFRESH_MS = 60_000;
const MARKET_PAGE_SIZE = 12;
const SIGNALS_PER_PAGE = 6;

type FilterValue = "ALL" | Signal["signal"];
type AnalysisTab = "SIGNALS" | "STRATEGIES";

interface ActivityItem {
  id: string;
  message: string;
  timestamp: string;
}

const StatsOverview = dynamic(
  () => import("@/components/StatsOverview").then((mod) => mod.StatsOverview),
  {
    ssr: false,
    loading: () => (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          "stats-tracked-markets",
          "stats-generated-signals",
          "stats-actions",
          "stats-confidence",
        ].map((key) => (
          <Skeleton key={key} className="h-32" />
        ))}
      </section>
    ),
  },
);

export default function DashboardPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [marketSearchInput, setMarketSearchInput] = useState("");
  const [marketPage, setMarketPage] = useState(1);
  const [marketPagination, setMarketPagination] =
    useState<PaginationMeta | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchPreviewResults, setSearchPreviewResults] = useState<Market[]>(
    [],
  );
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false);
  const [searchPreviewError, setSearchPreviewError] = useState<string | null>(
    null,
  );
  const [signals, setSignals] = useState<Signal[]>([]);
  const [latestSignalsByMarketId, setLatestSignalsByMarketId] = useState<
    Record<string, PersistedSignal>
  >({});
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketSource, setMarketSource] = useState<
    "polymarket" | "mock" | null
  >(null);
  const [runExecuting, setRunExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [signalsPage, setSignalsPage] = useState(1);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("SIGNALS");
  const [selectedMarketIds, setSelectedMarketIds] = useState<Set<string>>(
    new Set(),
  );
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("");
  const [strategyRuns, setStrategyRuns] = useState<StrategyRun[]>([]);
  const [marketDetailsOpen, setMarketDetailsOpen] = useState(false);
  const [detailMarket, setDetailMarket] = useState<Market | null>(null);

  const prevMarketsRef = useRef<Market[]>([]);

  const pushActivity = useCallback((message: string) => {
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          message,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 10),
    );
  }, []);

  const loadStrategies = useCallback(async () => {
    const res = await fetch("/api/strategies");
    if (!res.ok) throw new Error(`Strategies API returned ${res.status}`);
    const data = (await res.json()) as { strategies: Strategy[] };
    setStrategies(data.strategies);
    setSelectedStrategyId((prev) => prev || data.strategies[0]?.id || "");
  }, []);

  const loadStrategyRuns = useCallback(async () => {
    const res = await fetch("/api/strategy-runs?limit=20");
    if (!res.ok) throw new Error(`Strategy runs API returned ${res.status}`);
    const data = (await res.json()) as { runs: StrategyRun[] };
    setStrategyRuns(data.runs);
  }, []);

  const loadRunDetails = useCallback(
    async (runId: string) => {
      const res = await fetch(`/api/strategy-runs/${runId}`);
      if (!res.ok) throw new Error(`Run details API returned ${res.status}`);
      const data = (await res.json()) as {
        run: StrategyRun & { signals?: PersistedSignal[] };
      };

      const runSignals = data.run.signals ?? [];
      const signalCards: Signal[] = runSignals.map((s) => ({
        market: s.marketQuestion,
        probability: 0,
        signal: s.signalType,
        confidence: s.confidence,
        reasoning: s.reasoning,
        action: s.action,
        timestamp: s.createdAt,
      }));

      const byMarketId = runSignals.reduce<Record<string, PersistedSignal>>(
        (acc, sig) => {
          acc[sig.marketId] = sig;
          return acc;
        },
        {},
      );

      setSignals(signalCards);
      setLatestSignalsByMarketId(byMarketId);
      setAnalysisTab("SIGNALS");
      pushActivity(`Loaded analysis results for run ${runId.slice(0, 8)}.`);
    },
    [pushActivity],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await Promise.all([loadStrategies(), loadStrategyRuns()]);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to initialize strategies",
          );
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [loadStrategies, loadStrategyRuns]);

  useEffect(() => {
    async function loadMarkets() {
      setMarketsLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (marketSearch.length > 0) query.set("q", marketSearch);
        query.set("page", String(marketPage));
        query.set("pageSize", String(MARKET_PAGE_SIZE));

        const res = await fetch(`/api/markets?${query.toString()}`);
        if (!res.ok) throw new Error(`Markets API returned ${res.status}`);
        const data = (await res.json()) as MarketsResponse;

        setPriceChanges(() => {
          const changes: Record<string, number> = {};
          for (const m of data.markets) {
            const prev = prevMarketsRef.current.find((p) => p.id === m.id);
            changes[m.id] =
              prev !== undefined ? m.probability - prev.probability : 0;
          }
          return changes;
        });

        prevMarketsRef.current = data.markets;
        setMarkets(data.markets);
        setMarketPagination(data.pagination ?? null);
        setMarketSource(data.source as "polymarket" | "mock");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error loading markets",
        );
      } finally {
        setMarketsLoading(false);
      }
    }

    void loadMarkets();
    const timer = setInterval(() => void loadMarkets(), MARKET_REFRESH_MS);
    return () => clearInterval(timer);
  }, [marketPage, marketSearch]);

  useEffect(() => {
    if (!searchModalOpen) {
      setSearchPreviewLoading(false);
      setSearchPreviewError(null);
      setSearchPreviewResults([]);
      return;
    }

    const queryValue = searchDraft.trim();
    if (queryValue.length === 0) {
      setSearchPreviewLoading(false);
      setSearchPreviewError(null);
      setSearchPreviewResults([]);
      return;
    }

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setSearchPreviewLoading(true);
      setSearchPreviewError(null);
      try {
        const query = new URLSearchParams({ q: queryValue, limit: "6" });
        const res = await fetch(`/api/markets?${query.toString()}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`Search API returned ${res.status}`);
        const data = (await res.json()) as MarketsResponse;
        setSearchPreviewResults(data.markets.slice(0, 6));
      } catch (err) {
        if (ac.signal.aborted) return;
        setSearchPreviewError(
          err instanceof Error ? err.message : "Failed to load search preview",
        );
        setSearchPreviewResults([]);
      } finally {
        if (!ac.signal.aborted) {
          setSearchPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [searchDraft, searchModalOpen]);

  useEffect(() => {
    setSignalsPage(1);
  }, [filter, signals.length]);

  const filteredSignals = useMemo(
    () =>
      filter === "ALL" ? signals : signals.filter((s) => s.signal === filter),
    [filter, signals],
  );

  const totalSignalPages = Math.max(
    1,
    Math.ceil(filteredSignals.length / SIGNALS_PER_PAGE),
  );
  const visibleSignals = useMemo(() => {
    const start = (signalsPage - 1) * SIGNALS_PER_PAGE;
    return filteredSignals.slice(start, start + SIGNALS_PER_PAGE);
  }, [filteredSignals, signalsPage]);

  const actionsByMarket = useMemo(
    () => Object.fromEntries(signals.map((s) => [s.market, s.action])),
    [signals],
  );

  const executeStrategy = useCallback(async () => {
    if (!selectedStrategyId) {
      setError("Select a strategy before running analysis");
      return;
    }
    if (selectedMarketIds.size === 0) {
      setError("Select at least one market before running analysis");
      return;
    }

    setRunExecuting(true);
    setError(null);
    try {
      pushActivity(
        `Running strategy on ${selectedMarketIds.size} selected markets.`,
      );
      const res = await fetch("/api/strategy-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: selectedStrategyId,
          marketIds: Array.from(selectedMarketIds),
        }),
      });

      if (!res.ok) {
        throw new Error(`Strategy run API returned ${res.status}`);
      }

      const data = (await res.json()) as { run: StrategyRun };
      await Promise.all([loadStrategyRuns(), loadRunDetails(data.run.id)]);
      pushActivity(
        `Strategy run completed with ${data.run.signalCount} stored signals.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Strategy execution failed",
      );
    } finally {
      setRunExecuting(false);
    }
  }, [
    loadRunDetails,
    loadStrategyRuns,
    pushActivity,
    selectedMarketIds,
    selectedStrategyId,
  ]);

  const handleToggleMarket = useCallback(
    (marketId: string, selected: boolean) => {
      setSelectedMarketIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(marketId);
        else next.delete(marketId);
        return next;
      });
    },
    [],
  );

  const handleTogglePage = useCallback(
    (selected: boolean) => {
      setSelectedMarketIds((prev) => {
        const next = new Set(prev);
        for (const m of markets) {
          if (selected) next.add(m.id);
          else next.delete(m.id);
        }
        return next;
      });
    },
    [markets],
  );

  const handleSelectAllFiltered = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (marketSearch.length > 0) query.set("q", marketSearch);
      query.set("page", "1");
      query.set("pageSize", "100");
      const res = await fetch(`/api/markets?${query.toString()}`);
      if (!res.ok) throw new Error(`Markets API returned ${res.status}`);
      const data = (await res.json()) as MarketsResponse;
      setSelectedMarketIds((prev) => {
        const next = new Set(prev);
        for (const m of data.markets) next.add(m.id);
        return next;
      });
      pushActivity(
        `Selected ${data.markets.length} markets from current filtered search.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to select filtered markets",
      );
    }
  }, [marketSearch, pushActivity]);

  const latestForDetail = detailMarket
    ? latestSignalsByMarketId[detailMarket.id]
    : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                Intelligence Dashboard
              </h1>
              {marketSource === "polymarket" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  LIVE
                </span>
              )}
              {marketSource === "mock" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  MOCK
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-400">
              Strategy-driven analysis with persisted summaries and history
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSearchDraft(marketSearch);
                setSearchModalOpen(true);
              }}
            >
              <Search className="h-4 w-4" />
              Search Markets
            </Button>
            {marketSearch.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setMarketSearch("");
                  setMarketSearchInput("");
                  setMarketPage(1);
                  setSearchDraft("");
                }}
              >
                {`Query: ${marketSearch}`}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void handleSelectAllFiltered()}
            >
              Select Filtered
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelectedMarketIds(new Set())}
              disabled={selectedMarketIds.size === 0}
            >
              Clear Selection
            </Button>
            <Select
              value={filter}
              onValueChange={(v) => setFilter(v as FilterValue)}
            >
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Filter by signal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Signals</SelectItem>
                <SelectItem value="MISPRICED">Mispriced</SelectItem>
                <SelectItem value="MOMENTUM">Momentum</SelectItem>
                <SelectItem value="ARBITRAGE">Arbitrage</SelectItem>
                <SelectItem value="BREAKING_NEWS">Breaking News</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => void executeStrategy()}
              disabled={runExecuting || selectedStrategyId === ""}
            >
              <RefreshCw
                className={`h-4 w-4 ${runExecuting ? "animate-spin" : ""}`}
              />
              {runExecuting ? "Running…" : "Analyze"}
            </Button>
          </div>
        </section>

        {marketsLoading ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </section>
        ) : (
          <StatsOverview signals={signals} marketCount={markets.length} />
        )}

        {error !== null ? (
          <Card className="border-rose-500/40 bg-rose-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-200">
                <AlertTriangle className="h-4 w-4" />
                Data Fetch Error
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-rose-200/90">
              {error}
            </CardContent>
          </Card>
        ) : null}

        <MarketTable
          markets={markets}
          priceChanges={priceChanges}
          actionsByMarket={actionsByMarket}
          selectedMarketIds={selectedMarketIds}
          onToggleMarket={handleToggleMarket}
          onTogglePage={handleTogglePage}
          onOpenMarketDetails={(market) => {
            setDetailMarket(market);
            setMarketDetailsOpen(true);
          }}
          searchValue={marketSearchInput}
          onSearchValueChange={setMarketSearchInput}
          onSearchSubmit={() => {
            setMarketPage(1);
            setMarketSearch(marketSearchInput.trim());
          }}
          onSearchClear={() => {
            setMarketSearchInput("");
            setMarketSearch("");
            setMarketPage(1);
          }}
          pagination={marketPagination ?? undefined}
          onPrevPage={() => setMarketPage((p) => Math.max(1, p - 1))}
          onNextPage={() =>
            setMarketPage((p) => {
              const max = marketPagination?.totalPages ?? p + 1;
              return Math.min(p + 1, max);
            })
          }
        />

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>
                  {analysisTab === "SIGNALS" ? "AI Signals" : "Strategies"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={analysisTab === "SIGNALS" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAnalysisTab("SIGNALS")}
                  >
                    Signals
                  </Button>
                  <Button
                    variant={
                      analysisTab === "STRATEGIES" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setAnalysisTab("STRATEGIES")}
                  >
                    Strategies
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {analysisTab === "SIGNALS" ? (
                filteredSignals.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No signals yet. Run a strategy on selected markets.
                  </p>
                ) : (
                  <>
                    <div className="signal-grid grid gap-3 md:grid-cols-2">
                      {visibleSignals.map((s) => (
                        <SignalCard
                          key={`${s.market}-${s.timestamp}`}
                          signal={s}
                        />
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                      <p>
                        Page {signalsPage} of {totalSignalPages} •{" "}
                        {filteredSignals.length} signals
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSignalsPage((p) => Math.max(1, p - 1))
                          }
                          disabled={signalsPage <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSignalsPage((p) =>
                              Math.min(totalSignalPages, p + 1),
                            )
                          }
                          disabled={signalsPage >= totalSignalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                        Strategy
                      </p>
                      <Select
                        value={selectedStrategyId}
                        onValueChange={setSelectedStrategyId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          {strategies.map((strategy) => (
                            <SelectItem key={strategy.id} value={strategy.id}>
                              {strategy.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        className="w-full"
                        onClick={() => void executeStrategy()}
                        disabled={runExecuting || selectedStrategyId === ""}
                      >
                        Run On {selectedMarketIds.size} Selected
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Recent Runs
                    </p>
                    {strategyRuns.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-400">
                        No strategy runs yet.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {strategyRuns.map((run) => (
                          <li
                            key={run.id}
                            className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2"
                          >
                            <div>
                              <p className="text-slate-200">
                                {run.strategyName}
                              </p>
                              <p className="text-xs text-slate-500">
                                {run.status} • {run.signalCount} signals •{" "}
                                {new Date(run.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void loadRunDetails(run.id)}
                            >
                              View
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-400">No activity yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className="border-b border-slate-800 pb-2"
                    >
                      <p className="text-slate-300">{item.message}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <MarketDetailModal
        market={detailMarket}
        latestSignal={latestForDetail}
        open={marketDetailsOpen}
        onClose={() => setMarketDetailsOpen(false)}
      />

      {searchModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">
              Search Polymarket Markets
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Enter a keyword and run search to filter markets.
            </p>

            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const query = searchDraft.trim();
                setMarketSearchInput(query);
                setMarketPage(1);
                setMarketSearch(query);
                setSearchModalOpen(false);
              }}
            >
              <input
                autoFocus
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="e.g. Bitcoin, election, Solana"
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                aria-label="Market search query"
              />

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/40 p-2">
                {searchPreviewLoading ? (
                  <p className="px-1 py-1 text-sm text-slate-400">
                    Searching...
                  </p>
                ) : searchPreviewError ? (
                  <p className="px-1 py-1 text-sm text-rose-300">
                    {searchPreviewError}
                  </p>
                ) : searchDraft.trim().length === 0 ? (
                  <p className="px-1 py-1 text-sm text-slate-500">
                    Type to preview up to 6 matching markets.
                  </p>
                ) : searchPreviewResults.length === 0 ? (
                  <p className="px-1 py-1 text-sm text-slate-400">
                    No matching markets found.
                  </p>
                ) : (
                  searchPreviewResults.slice(0, 6).map((market) => (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => {
                        setSearchDraft(market.question);
                        setMarketSearchInput(market.question);
                        setMarketPage(1);
                        setMarketSearch(market.question);
                        setSearchModalOpen(false);
                      }}
                      className="block w-full rounded-md border border-slate-800 px-3 py-2 text-left transition-colors hover:border-cyan-500/40 hover:bg-slate-900"
                    >
                      <p className="line-clamp-2 text-sm text-slate-200">
                        {market.question}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Probability {(market.probability * 100).toFixed(1)}% •
                        Volume ${Math.round(market.volume).toLocaleString()}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSearchModalOpen(false);
                    setSearchDraft(marketSearch);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMarketSearchInput("");
                    setSearchDraft("");
                    setMarketPage(1);
                    setMarketSearch("");
                    setSearchModalOpen(false);
                  }}
                >
                  Clear
                </Button>
                <Button type="submit">Search</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
