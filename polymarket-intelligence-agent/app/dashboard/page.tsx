"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Save,
  Search,
  X,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { AgentStatus } from "@/app/api/status/route";
import type {
  Market,
  MarketsResponse,
  PaginationMeta,
  PersistedSignal,
  Signal,
  SimulationSession,
  Strategy,
  StrategyRun,
} from "@/lib/types";

const MARKET_STALE_MS = 3 * 60_000;
const MARKET_PAGE_SIZE = 12;

interface StrategyDraft {
  name: string;
  description: string;
  promptTemplate: string;
  batchSize: number;
}

interface SimCreateDraft {
  name: string;
  betSize: number;
  interval: "1h" | "4h" | "1d" | "custom";
  intervalMin: number;
}

const EMPTY_STRATEGY_DRAFT: StrategyDraft = {
  name: "",
  description: "",
  promptTemplate: "",
  batchSize: 4,
};

const DEFAULT_SIM_DRAFT: SimCreateDraft = {
  name: "",
  betSize: 100,
  interval: "1h",
  intervalMin: 60,
};

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
  const [lastMarketsRefreshAt, setLastMarketsRefreshAt] = useState<number>(0);
  const [marketSource, setMarketSource] = useState<
    "polymarket" | "mock" | null
  >(null);
  const [runExecuting, setRunExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarketIds, setSelectedMarketIds] = useState<Set<string>>(
    new Set(),
  );
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("");
  const [strategyRuns, setStrategyRuns] = useState<StrategyRun[]>([]);
  const [marketDetailsOpen, setMarketDetailsOpen] = useState(false);
  const [detailMarket, setDetailMarket] = useState<Market | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);

  // Strategy table + modal state
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyModalId, setStrategyModalId] = useState<string | null>(null); // null = new
  const [strategyDraft, setStrategyDraft] =
    useState<StrategyDraft>(EMPTY_STRATEGY_DRAFT);
  const [strategySaving, setStrategySaving] = useState(false);

  // Simulation state
  const [simulations, setSimulations] = useState<SimulationSession[]>([]);
  const [simCreateOpen, setSimCreateOpen] = useState(false);
  const [simCreateDraft, setSimCreateDraft] =
    useState<SimCreateDraft>(DEFAULT_SIM_DRAFT);
  const [simCreating, setSimCreating] = useState(false);
  // Quick add from strategy signal -> simulation
  const [quickSimOpen, setQuickSimOpen] = useState(false);
  const [quickSimSignals, setQuickSimSignals] = useState<PersistedSignal[]>([]);
  const [quickSimSessionId, setQuickSimSessionId] = useState("");
  const [quickSimBetSize, setQuickSimBetSize] = useState("100");
  const [quickSimAction, setQuickSimAction] = useState<"BUY" | "SELL">("BUY");
  const [quickSimOutcomeIndex, setQuickSimOutcomeIndex] = useState("0");
  const [quickSimSaving, setQuickSimSaving] = useState(false);

  // Merged signals view state
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runSignalsCache, setRunSignalsCache] = useState<
    Record<string, PersistedSignal[]>
  >({});
  const [signalSearch, setSignalSearch] = useState("");
  const [signalSearchInput, setSignalSearchInput] = useState("");
  const [signalViewMode, setSignalViewMode] = useState<"cards" | "table">(
    "cards",
  );
  const [selectedSignalIds, setSelectedSignalIds] = useState<Set<string>>(
    new Set(),
  );

  const prevMarketsRef = useRef<Market[]>([]);

  const loadMarkets = useCallback(async () => {
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
      setLastMarketsRefreshAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error loading markets",
      );
    } finally {
      setMarketsLoading(false);
    }
  }, [marketPage, marketSearch]);

  const refreshMarketsIfStale = useCallback(async () => {
    if (Date.now() - lastMarketsRefreshAt < MARKET_STALE_MS) return false;
    await loadMarkets();
    return true;
  }, [lastMarketsRefreshAt, loadMarkets]);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json() as Promise<AgentStatus>)
      .then(setAgentStatus)
      .catch(() => null);
  }, []);

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

  const loadSimulations = useCallback(async () => {
    try {
      const res = await fetch("/api/simulations");
      if (!res.ok) throw new Error(`Simulations API returned ${res.status}`);
      const data = (await res.json()) as { sessions: SimulationSession[] };
      setSimulations(data.sessions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load simulations",
      );
    }
  }, []);

  const createSimulation = useCallback(async () => {
    setSimCreating(true);
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simCreateDraft),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const data = (await res.json()) as { session?: SimulationSession };
      await loadSimulations();
      setSimCreateOpen(false);
      setSimCreateDraft(DEFAULT_SIM_DRAFT);
      if (quickSimSignals.length > 0 && data.session?.id) {
        setQuickSimSessionId(data.session.id);
        setQuickSimOpen(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create simulation",
      );
    } finally {
      setSimCreating(false);
    }
  }, [simCreateDraft, loadSimulations, quickSimSignals.length]);

  const marketProbabilityById = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.id, m.probability])),
    [markets],
  );
  const marketClobTokenById = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.id, m.clobTokenId ?? ""])),
    [markets],
  );
  const marketById = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.id, m])),
    [markets],
  );

  const selectedSignals = useMemo(() => {
    const byId = new Map<string, PersistedSignal>();
    for (const sig of Object.values(runSignalsCache).flat()) {
      if (selectedSignalIds.has(sig.id)) byId.set(sig.id, sig);
    }
    return Array.from(byId.values());
  }, [runSignalsCache, selectedSignalIds]);

  const openQuickSimFromSignal = useCallback(
    async (sig: PersistedSignal) => {
      await refreshMarketsIfStale();
      setQuickSimSignals([sig]);
      setQuickSimSessionId((prev) => prev || simulations[0]?.id || "");
      setQuickSimBetSize("100");
      setQuickSimAction(sig.action === "SELL" ? "SELL" : "BUY");
      const market = marketById[sig.marketId];
      const hasNoSide = (market?.outcomePrices?.length ?? 0) > 1;
      setQuickSimOutcomeIndex(sig.action === "SELL" && hasNoSide ? "1" : "0");
      setQuickSimOpen(true);
    },
    [refreshMarketsIfStale, simulations, marketById],
  );

  const openQuickSimFromSelected = useCallback(async () => {
    if (selectedSignals.length === 0) return;
    await refreshMarketsIfStale();
    setQuickSimSignals(selectedSignals);
    setQuickSimSessionId((prev) => prev || simulations[0]?.id || "");
    setQuickSimBetSize("100");
    setQuickSimAction("BUY");
    setQuickSimOutcomeIndex("0");
    setQuickSimOpen(true);
  }, [refreshMarketsIfStale, selectedSignals, simulations]);

  const addSignalToSimulation = useCallback(async () => {
    if (quickSimSignals.length === 0 || !quickSimSessionId) {
      setError("Select a simulation before adding a position");
      return;
    }
    const missing = quickSimSignals.filter(
      (sig) => marketProbabilityById[sig.marketId] === undefined,
    );
    if (missing.length > 0) {
      setError(
        "Some selected markets have no live probability loaded yet. Refresh markets and try again.",
      );
      return;
    }

    setQuickSimSaving(true);
    try {
      for (const sig of quickSimSignals) {
        const action = sig.action === "MONITOR" ? quickSimAction : sig.action;
        const market = marketById[sig.marketId];
        const outcomePrices = market?.outcomePrices ?? [];
        const outcomeTokenIds = market?.outcomeTokenIds ?? [];
        const inferredIndex =
          quickSimSignals.length === 1
            ? Number(quickSimOutcomeIndex)
            : action === "SELL" && outcomePrices.length > 1
              ? 1
              : 0;
        const safeIndex = Number.isFinite(inferredIndex)
          ? Math.max(
              0,
              Math.min(inferredIndex, Math.max(0, outcomePrices.length - 1)),
            )
          : 0;
        const probability =
          outcomePrices[safeIndex] ?? marketProbabilityById[sig.marketId] ?? 0;
        const clobTokenId =
          outcomeTokenIds[safeIndex] ||
          marketClobTokenById[sig.marketId] ||
          undefined;
        const res = await fetch(
          `/api/simulations/${quickSimSessionId}/positions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              marketId: sig.marketId,
              clobTokenId,
              marketQuestion: sig.marketQuestion,
              action,
              currentProbability: probability,
              betSize: Number(quickSimBetSize) || 100,
            }),
          },
        );
        if (!res.ok) throw new Error(`Add to simulation failed: ${res.status}`);
      }
      await loadSimulations();
      pushActivity(
        `Added ${quickSimSignals.length} signal${quickSimSignals.length === 1 ? "" : "s"} to simulation ${quickSimSessionId.slice(0, 8)}.`,
      );
      setSelectedSignalIds((prev) => {
        const next = new Set(prev);
        for (const sig of quickSimSignals) next.delete(sig.id);
        return next;
      });
      setQuickSimOpen(false);
      setQuickSimSignals([]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add signal to simulation",
      );
    } finally {
      setQuickSimSaving(false);
    }
  }, [
    quickSimSignals,
    quickSimSessionId,
    quickSimBetSize,
    quickSimAction,
    quickSimOutcomeIndex,
    marketProbabilityById,
    marketClobTokenById,
    marketById,
    loadSimulations,
    pushActivity,
  ]);

  const openStrategyModal = useCallback((strategy?: Strategy) => {
    if (strategy) {
      setStrategyModalId(strategy.id);
      setStrategyDraft({
        name: strategy.name,
        description: strategy.description ?? "",
        promptTemplate: strategy.promptTemplate,
        batchSize: strategy.batchSize,
      });
    } else {
      setStrategyModalId(null);
      setStrategyDraft(EMPTY_STRATEGY_DRAFT);
    }
    setStrategyModalOpen(true);
  }, []);

  const saveStrategyModal = useCallback(async () => {
    if (!strategyDraft.name.trim() || !strategyDraft.promptTemplate.trim()) {
      setError("Strategy name and prompt template are required");
      return;
    }
    setStrategySaving(true);
    try {
      const url = strategyModalId
        ? `/api/strategies/${strategyModalId}`
        : "/api/strategies";
      const method = strategyModalId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(strategyDraft),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      await loadStrategies();
      setStrategyModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setStrategySaving(false);
    }
  }, [strategyModalId, strategyDraft, loadStrategies]);

  const loadRunSignals = useCallback(
    async (runId: string) => {
      if (runSignalsCache[runId]) return; // already cached
      try {
        const res = await fetch(`/api/strategy-runs/${runId}`);
        if (!res.ok) throw new Error(`Run details API returned ${res.status}`);
        const data = (await res.json()) as {
          run: StrategyRun & { signals?: PersistedSignal[] };
        };
        setRunSignalsCache((prev) => ({
          ...prev,
          [runId]: data.run.signals ?? [],
        }));
        // also update main signal overlays for the market table
        const runSignals = data.run.signals ?? [];
        const byMarketId = runSignals.reduce<Record<string, PersistedSignal>>(
          (acc, s) => {
            acc[s.marketId] = s;
            return acc;
          },
          {},
        );
        setLatestSignalsByMarketId(byMarketId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load run signals",
        );
      }
    },
    [runSignalsCache],
  );

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
      setRunSignalsCache((prev) => ({ ...prev, [runId]: runSignals }));
      setExpandedRunId(runId);
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
    void loadSimulations();
  }, [loadSimulations]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshMarketsIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshMarketsIfStale]);

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
            <Button variant="outline" onClick={() => void loadMarkets()}>
              <RefreshCw className="h-4 w-4" />
              Refresh Markets
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

        {agentStatus !== null &&
        (!agentStatus.eliza || agentStatus.nosana === "down") ? (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {!agentStatus.eliza
                ? "Eliza agent is offline."
                : "Nosana inference endpoint is offline."}
              {agentStatus.openrouter
                ? " Falling back to OpenRouter for analysis."
                : " No LLM fallback configured — add OPENROUTER_API_KEY to enable OpenRouter fallback."}
            </span>
          </div>
        ) : null}

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

        {/* ── Strategies Table ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Strategies</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openStrategyModal()}
              >
                <Plus className="h-4 w-4" />
                Add Strategy
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {strategies.length === 0 ? (
              <p className="px-6 pb-4 text-sm text-slate-400">
                No strategies found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Description
                    </TableHead>
                    <TableHead className="w-20 text-center">Batch</TableHead>
                    <TableHead className="w-20 text-center">Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategies.map((strategy) => (
                    <TableRow
                      key={strategy.id}
                      className={`cursor-pointer ${
                        selectedStrategyId === strategy.id
                          ? "bg-cyan-950/30"
                          : ""
                      }`}
                      onClick={() => setSelectedStrategyId(strategy.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-100">
                            {strategy.name}
                          </span>
                          {strategy.isDefault && (
                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                              default
                            </span>
                          )}
                          {selectedStrategyId === strategy.id && (
                            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300 ring-1 ring-cyan-500/40">
                              active
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-slate-400 sm:table-cell">
                        {strategy.description ?? (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-slate-300">
                        {strategy.batchSize}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            strategy.active
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {strategy.active ? "active" : "inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStrategyModal(strategy);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
          {/* ── Merged Strategy Runs + Signals card ── */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Strategy Runs &amp; Signals</CardTitle>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedStrategyId}
                    onValueChange={setSelectedStrategyId}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => void executeStrategy()}
                    disabled={runExecuting || selectedStrategyId === ""}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${runExecuting ? "animate-spin" : ""}`}
                    />
                    {runExecuting
                      ? "Running…"
                      : `Run (${selectedMarketIds.size})`}
                  </Button>
                </div>
              </div>
              {/* Search bar */}
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={signalSearchInput}
                  onChange={(e) => setSignalSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      setSignalSearch(signalSearchInput.trim());
                  }}
                  placeholder="Search by strategy, market, or signal type…"
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                />
                {signalSearchInput.length > 0 && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    onClick={() => {
                      setSignalSearchInput("");
                      setSignalSearch("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={signalViewMode === "cards" ? "default" : "outline"}
                    onClick={() => setSignalViewMode("cards")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Cards
                  </Button>
                  <Button
                    size="sm"
                    variant={signalViewMode === "table" ? "default" : "outline"}
                    onClick={() => setSignalViewMode("table")}
                  >
                    <Rows3 className="h-4 w-4" />
                    Table
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedSignals.length === 0}
                  onClick={() => void openQuickSimFromSelected()}
                >
                  <CheckSquare className="h-4 w-4" />
                  Simulate Selected ({selectedSignals.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-0">
              {(() => {
                const q = signalSearch.toLowerCase();
                const visibleRuns = strategyRuns.filter(
                  (run) =>
                    q.length === 0 ||
                    run.strategyName.toLowerCase().includes(q) ||
                    run.status.toLowerCase().includes(q),
                );
                if (visibleRuns.length === 0) {
                  return (
                    <p className="px-6 pb-4 text-sm text-slate-400">
                      {strategyRuns.length === 0
                        ? "No strategy runs yet. Select markets and click Run."
                        : "No runs match your search."}
                    </p>
                  );
                }
                return visibleRuns.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const cached = runSignalsCache[run.id] ?? [];
                  const filteredSignals = cached.filter(
                    (sig) =>
                      q.length === 0 ||
                      sig.marketQuestion.toLowerCase().includes(q) ||
                      sig.signalType.toLowerCase().includes(q) ||
                      sig.action.toLowerCase().includes(q),
                  );
                  const statusColor: Record<string, string> = {
                    completed: "text-emerald-300 bg-emerald-500/15",
                    running: "text-cyan-300 bg-cyan-500/15",
                    pending: "text-amber-300 bg-amber-500/15",
                    failed: "text-rose-300 bg-rose-500/15",
                  };
                  return (
                    <div
                      key={run.id}
                      className="border-b border-slate-800/70 last:border-0"
                    >
                      {/* Run header row */}
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left hover:bg-slate-800/30 transition-colors"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedRunId(null);
                          } else {
                            setExpandedRunId(run.id);
                            void loadRunSignals(run.id);
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-100 truncate">
                              {run.strategyName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(run.createdAt).toLocaleString()} •{" "}
                              {run.signalCount} signal
                              {run.signalCount !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColor[run.status] ??
                            "text-slate-300 bg-slate-700"
                          }`}
                        >
                          {run.status}
                        </span>
                      </button>

                      {/* Expanded signals */}
                      {isExpanded && (
                        <div className="px-6 pb-4">
                          {runSignalsCache[run.id] === undefined ? (
                            <p className="text-sm text-slate-400">
                              Loading signals…
                            </p>
                          ) : filteredSignals.length === 0 ? (
                            <p className="text-sm text-slate-400">
                              No signals
                              {q.length > 0 ? " match your search" : ""}.
                            </p>
                          ) : signalViewMode === "cards" ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                              {filteredSignals.map((sig) => (
                                <div
                                  key={sig.id}
                                  className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/20 p-3"
                                >
                                  <div className="flex items-center justify-between gap-2 px-1">
                                    <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                                      <input
                                        type="checkbox"
                                        checked={selectedSignalIds.has(sig.id)}
                                        onChange={(e) => {
                                          setSelectedSignalIds((prev) => {
                                            const next = new Set(prev);
                                            if (e.target.checked)
                                              next.add(sig.id);
                                            else next.delete(sig.id);
                                            return next;
                                          });
                                        }}
                                      />
                                      <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
                                      Select
                                    </label>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        void openQuickSimFromSignal(sig)
                                      }
                                    >
                                      <Plus className="h-4 w-4" />
                                      Simulate
                                    </Button>
                                  </div>
                                  <div className="overflow-hidden rounded-lg">
                                    <SignalCard
                                      signal={{
                                        market: sig.marketQuestion,
                                        probability:
                                          marketProbabilityById[sig.marketId] ??
                                          0,
                                        signal: sig.signalType,
                                        confidence: sig.confidence,
                                        reasoning: sig.reasoning,
                                        action: sig.action,
                                        timestamp: sig.createdAt,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12" />
                                  <TableHead>Market</TableHead>
                                  <TableHead className="w-28">Signal</TableHead>
                                  <TableHead className="w-20">Action</TableHead>
                                  <TableHead className="w-24 text-right">
                                    Confidence
                                  </TableHead>
                                  <TableHead className="w-24 text-right">
                                    Probability
                                  </TableHead>
                                  <TableHead className="w-28" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredSignals.map((sig) => (
                                  <TableRow key={sig.id}>
                                    <TableCell>
                                      <input
                                        type="checkbox"
                                        checked={selectedSignalIds.has(sig.id)}
                                        onChange={(e) => {
                                          setSelectedSignalIds((prev) => {
                                            const next = new Set(prev);
                                            if (e.target.checked)
                                              next.add(sig.id);
                                            else next.delete(sig.id);
                                            return next;
                                          });
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="max-w-md">
                                      <p className="truncate text-sm text-slate-200">
                                        {sig.marketQuestion}
                                      </p>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-300">
                                      {sig.signalType}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-300">
                                      {sig.action === "BUY"
                                        ? "BUY YES"
                                        : sig.action === "SELL"
                                          ? "BUY NO"
                                          : "MONITOR"}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-slate-300">
                                      {(sig.confidence * 100).toFixed(0)}%
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-slate-300">
                                      {(
                                        (marketProbabilityById[sig.marketId] ??
                                          0) * 100
                                      ).toFixed(2)}
                                      %
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          void openQuickSimFromSignal(sig)
                                        }
                                      >
                                        <Plus className="h-4 w-4" />
                                        Simulate
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
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

      {/* Quick add from signal(s) -> simulation */}
      {quickSimOpen && quickSimSignals.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">
                Simulate Signal{quickSimSignals.length > 1 ? "s" : ""}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-200"
                onClick={() => setQuickSimOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                {quickSimSignals.length === 1 ? (
                  <>
                    <p className="line-clamp-2 text-sm text-slate-200">
                      {quickSimSignals[0].marketQuestion}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Action: {quickSimSignals[0].action} • Signal:{" "}
                      {quickSimSignals[0].signalType}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-200">
                      {quickSimSignals.length} selected markets
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      All selected signals will be added to the chosen
                      simulation.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Simulation
                </label>
                <Select
                  value={quickSimSessionId}
                  onValueChange={setQuickSimSessionId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select simulation" />
                  </SelectTrigger>
                  <SelectContent>
                    {simulations
                      .filter((s) => s.status !== "stopped")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {simulations.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-300">
                      Create a simulation first, then add this signal.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setQuickSimOpen(false);
                        setSimCreateOpen(true);
                        setSimCreateDraft((prev) => ({
                          ...prev,
                          name:
                            quickSimSignals[0]?.marketQuestion.slice(0, 48) ??
                            prev.name,
                        }));
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Create Simulation
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Simulation Action
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={quickSimAction === "BUY" ? "default" : "outline"}
                    onClick={() => setQuickSimAction("BUY")}
                  >
                    BUY YES
                  </Button>
                  <Button
                    size="sm"
                    variant={quickSimAction === "SELL" ? "default" : "outline"}
                    onClick={() => setQuickSimAction("SELL")}
                  >
                    BUY NO
                  </Button>
                </div>
              </div>

              {quickSimSignals.length === 1 && (() => {
                const market = marketById[quickSimSignals[0].marketId];
                const outcomes = market?.outcomes ?? [];
                const prices = market?.outcomePrices ?? [];
                if (outcomes.length < 2 || prices.length < 2) return null;
                return (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Outcome Side
                    </label>
                    <Select
                      value={quickSimOutcomeIndex}
                      onValueChange={setQuickSimOutcomeIndex}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {outcomes.map((label, idx) => (
                          <SelectItem key={`${label}-${idx}`} value={String(idx)}>
                            {label} ({((prices[idx] ?? 0) * 100).toFixed(2)}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Bet Size ($)
                </label>
                <input
                  type="number"
                  min={1}
                  value={quickSimBetSize}
                  onChange={(e) => setQuickSimBetSize(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                />
              </div>

              <p className="text-xs text-slate-500">
                This uses current live market probability as the entry price for
                each selected signal.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setQuickSimOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void addSignalToSimulation()}
                disabled={quickSimSaving || quickSimSessionId === ""}
              >
                <Save className="h-4 w-4" />
                {quickSimSaving ? "Adding…" : "Add Position"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Strategy create/edit modal ── */}
      {strategyModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">
                {strategyModalId ? "Edit Strategy" : "New Strategy"}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-200"
                onClick={() => setStrategyModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    autoFocus
                    value={strategyDraft.name}
                    onChange={(e) =>
                      setStrategyDraft((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Momentum Hunter"
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Description
                  </label>
                  <input
                    value={strategyDraft.description}
                    onChange={(e) =>
                      setStrategyDraft((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Prompt Template <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={strategyDraft.promptTemplate}
                  onChange={(e) =>
                    setStrategyDraft((p) => ({
                      ...p,
                      promptTemplate: e.target.value,
                    }))
                  }
                  rows={7}
                  placeholder="Analyze these markets and return JSON signals..."
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70 resize-y font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Batch Size
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={strategyDraft.batchSize}
                  onChange={(e) =>
                    setStrategyDraft((p) => ({
                      ...p,
                      batchSize: Number(e.target.value),
                    }))
                  }
                  className="h-9 w-28 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setStrategyModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void saveStrategyModal()}
                disabled={strategySaving}
              >
                <Save className="h-4 w-4" />
                {strategySaving ? "Saving…" : "Save Strategy"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Create Simulation modal ── */}
      {simCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">
                New Simulation
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-200"
                onClick={() => setSimCreateOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-md border border-cyan-900/50 bg-cyan-950/20 p-3 text-xs text-cyan-200">
                Simulations are manual-only right now. No background tick jobs
                are scheduled.
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Name <span className="text-rose-400">*</span>
                </label>
                <input
                  autoFocus
                  value={simCreateDraft.name}
                  onChange={(e) =>
                    setSimCreateDraft((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Crypto Bull Run"
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Default Bet Size ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={simCreateDraft.betSize}
                    onChange={(e) =>
                      setSimCreateDraft((p) => ({
                        ...p,
                        betSize: Number(e.target.value),
                      }))
                    }
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Preferred Tick Cadence
                  </label>
                  <Select
                    value={simCreateDraft.interval}
                    onValueChange={(v) =>
                      setSimCreateDraft((p) => ({
                        ...p,
                        interval: v as "1h" | "4h" | "1d" | "custom",
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Every hour</SelectItem>
                      <SelectItem value="4h">Every 4 hours</SelectItem>
                      <SelectItem value="1d">Every day</SelectItem>
                      <SelectItem value="custom">Custom (minutes)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Saved as metadata for manual tick workflows.
                  </p>
                </div>
              </div>
              {simCreateDraft.interval === "custom" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Interval (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={simCreateDraft.intervalMin}
                    onChange={(e) =>
                      setSimCreateDraft((p) => ({
                        ...p,
                        intervalMin: Number(e.target.value),
                      }))
                    }
                    className="h-9 w-28 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
                  />
                </div>
              )}
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setSimCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void createSimulation()}
                disabled={simCreating || !simCreateDraft.name.trim()}
              >
                <Plus className="h-4 w-4" />
                {simCreating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
