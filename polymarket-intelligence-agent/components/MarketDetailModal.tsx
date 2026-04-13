"use client";

import { ExternalLink, Loader2 } from "lucide-react";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Market,
  PersistedSignal,
  SimulationSession,
  Strategy,
} from "@/lib/types";
import { formatPercent, formatVolume } from "@/lib/utils";

export const ADD_NEW_STRATEGY_VALUE = "__add_new_strategy__";

interface MarketDetailModalProps {
  market: Market | null;
  latestSignal?: PersistedSignal;
  open: boolean;
  onClose: () => void;
  onRunAnalysis?: () => void;
  onSimulate?: () => void;
  runExecuting?: boolean;
  strategies?: Strategy[];
  selectedStrategyId?: string;
  onStrategyChange?: (id: string) => void;
  recentAnalyses?: MarketRecentAnalysis[];
  simulations?: SimulationSession[];
  onDeleteSimulation?: (id: string) => Promise<void>;
}

export interface MarketRecentAnalysis {
  runId: string;
  strategyName: string;
  signalType: PersistedSignal["signalType"];
  action: PersistedSignal["action"];
  confidence: number;
  createdAt: string;
}

interface PricePoint {
  t: number;
  p: number;
}

interface SimulationPnlPoint {
  t: number;
  pnl: number;
}

interface SimulationHistoryItem {
  marketId: string;
  takenAt: string;
  pnl: number;
}

interface SimulationPositionItem {
  marketId: string;
  createdAt: string;
}

function formatSharePrice(probability: number): string {
  return `$${probability.toFixed(3)}`;
}

function actionColor(action: PersistedSignal["action"]): string {
  if (action === "BUY") return "text-emerald-300";
  if (action === "SELL") return "text-rose-300";
  return "text-slate-300";
}

function resolveMarketVenueUrl(market: Market): string | null {
  if (market.conditionId || market.venue === "polymarket") {
    return `https://polymarket.com/search?q=${encodeURIComponent(market.question)}`;
  }
  if (market.venue === "kalshi") {
    if (market.externalId) {
      return `https://kalshi.com/markets/${encodeURIComponent(market.externalId)}`;
    }
    return `https://kalshi.com/markets?query=${encodeURIComponent(market.question)}`;
  }
  if (market.externalId) {
    return `https://kalshi.com/markets/${encodeURIComponent(market.externalId)}`;
  }
  return null;
}

function PriceHistoryChart({
  history,
  loading,
  error,
}: {
  history: PricePoint[];
  loading: boolean;
  error: string | null;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-rose-300">
        {error}
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-slate-400">
        No price history available for this market.
      </div>
    );
  }

  const maxPoints = 200;
  const raw = history;
  const data =
    raw.length > maxPoints
      ? raw.filter((_, i) => i % Math.ceil(raw.length / maxPoints) === 0)
      : raw;

  const W = 600;
  const H = 200;
  const padL = 38;
  const padB = 22;
  const plotW = W - padL - 8;
  const plotH = H - padB - 10;
  const minT = data[0].t;
  const maxT = data[data.length - 1].t;
  const midT = minT + (maxT - minT) / 2;
  const tRange = maxT - minT || 1;
  const toDate = (value: number) =>
    new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  const formatDate = (value: number) =>
    toDate(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const formatSharePrice = (probability: number) =>
    `$${probability.toFixed(3)}`;
  const toX = (t: number) => padL + ((t - minT) / tRange) * plotW;
  const toY = (p: number) => 10 + (1 - p) * plotH;
  const yesPath = data
    .map(
      (pt, i) =>
        `${i === 0 ? "M" : "L"} ${toX(pt.t).toFixed(1)} ${toY(pt.p).toFixed(1)}`,
    )
    .join(" ");
  const noPath = data
    .map(
      (pt, i) =>
        `${i === 0 ? "M" : "L"} ${toX(pt.t).toFixed(1)} ${toY(1 - pt.p).toFixed(1)}`,
    )
    .join(" ");
  const lastP = data[data.length - 1]?.p ?? 0;
  const hoverPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoverX = hoverPoint ? toX(hoverPoint.t) : null;
  const hoverYYes = hoverPoint ? toY(hoverPoint.p) : null;
  const hoverYNo = hoverPoint ? toY(1 - hoverPoint.p) : null;
  const maxTX = toX(maxT).toFixed(1);
  const baseY = toY(0).toFixed(1);
  const originX = padL.toFixed(1);
  const tooltipX =
    hoverX !== null ? Math.max(padL + 8, Math.min(W - 165, hoverX - 75)) : 0;

  const findNearestIndex = (targetT: number) => {
    let nearest = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < data.length; i += 1) {
      const distance = Math.abs(data[i].t - targetT);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = i;
      }
    }
    return nearest;
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "220px" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.width === 0) return;
          const cursorX = e.clientX - rect.left;
          const svgX = (cursorX / rect.width) * W;
          const clampedX = Math.max(padL, Math.min(W - 8, svgX));
          const targetT = minT + ((clampedX - padL) / plotW) * tRange;
          setHoveredIndex(findNearestIndex(targetT));
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1.0].map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={W - 8}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#334155"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <text
              x={padL - 5}
              y={toY(tick) + 4}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="10"
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        <path
          d={`${yesPath} L ${maxTX} ${baseY} L ${originX} ${baseY} Z`}
          fill="#8b5cf6"
          fillOpacity="0.12"
        />
        <path
          d={`${noPath} L ${maxTX} ${baseY} L ${originX} ${baseY} Z`}
          fill="#f43f5e"
          fillOpacity="0.08"
        />
        <path
          d={yesPath}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={noPath}
          fill="none"
          stroke="#f43f5e"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverPoint &&
        hoverX !== null &&
        hoverYYes !== null &&
        hoverYNo !== null ? (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={10}
              y2={H - padB}
              stroke="#64748b"
              strokeDasharray="4 3"
              strokeWidth="1"
            />
            <circle cx={hoverX} cy={hoverYYes} r="4" fill="#8b5cf6" />
            <circle cx={hoverX} cy={hoverYNo} r="4" fill="#f43f5e" />
            <g transform={`translate(${tooltipX}, 14)`}>
              <rect
                width="150"
                height="52"
                rx="8"
                fill="#020617"
                fillOpacity="0.95"
                stroke="#334155"
              />
              <text x="8" y="14" fill="#cbd5e1" fontSize="10">
                {formatDate(hoverPoint.t)}
              </text>
              <text x="8" y="30" fill="#a78bfa" fontSize="10">
                YES {formatPercent(hoverPoint.p)} (
                {formatSharePrice(hoverPoint.p)})
              </text>
              <text x="8" y="44" fill="#fb7185" fontSize="10">
                NO {formatPercent(1 - hoverPoint.p)} (
                {formatSharePrice(1 - hoverPoint.p)})
              </text>
            </g>
          </>
        ) : null}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{formatDate(minT)}</span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-violet-400">
            <span className="inline-block h-0.5 w-5 rounded bg-violet-500" />
            YES {formatPercent(lastP)} ({formatSharePrice(lastP)})
          </span>
          <span className="inline-flex items-center gap-1.5 text-rose-400">
            <span className="inline-block h-0.5 w-5 rounded bg-rose-500" />
            NO {formatPercent(1 - lastP)} ({formatSharePrice(1 - lastP)})
          </span>
        </div>
        <span>{formatDate(maxT)}</span>
      </div>
      <div className="mt-1 flex items-center justify-center text-[11px] text-slate-500">
        <span>Midpoint: {formatDate(midT)}</span>
      </div>
    </div>
  );
}

function SimulationPnlChart({
  points,
  loading,
  error,
  placedAt,
}: {
  points: SimulationPnlPoint[];
  loading: boolean;
  error: string | null;
  placedAt: number | null;
}) {
  if (loading) {
    return (
      <div className="flex h-36 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-rose-300">{error}</p>;
  }
  if (points.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-slate-500">No snapshots yet.</p>
        {placedAt ? (
          <p className="text-xs text-cyan-300">
            Bet placed: {new Date(placedAt).toLocaleString()}
          </p>
        ) : null}
      </div>
    );
  }

  const W = 520;
  const H = 120;
  const padL = 36;
  const padB = 18;
  const plotW = W - padL - 8;
  const plotH = H - padB - 8;
  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const tRange = maxT - minT || 1;
  const minPnl = Math.min(...points.map((p) => p.pnl), 0);
  const maxPnl = Math.max(...points.map((p) => p.pnl), 0);
  const pnlRange = maxPnl - minPnl || 1;
  const toX = (t: number) => padL + ((t - minT) / tRange) * plotW;
  const toY = (pnl: number) => 8 + (1 - (pnl - minPnl) / pnlRange) * plotH;
  const line = points
    .map(
      (pt, i) =>
        `${i === 0 ? "M" : "L"} ${toX(pt.t).toFixed(1)} ${toY(pt.pnl).toFixed(1)}`,
    )
    .join(" ");
  const zeroY = toY(0);
  const last = points[points.length - 1]?.pnl ?? 0;
  const clampedPlacedAt =
    placedAt === null ? null : Math.max(minT, Math.min(maxT, placedAt));
  const placedX = clampedPlacedAt === null ? null : toX(clampedPlacedAt);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "145px" }}
      >
        <line
          x1={padL}
          x2={W - 8}
          y1={zeroY}
          y2={zeroY}
          stroke="#475569"
          strokeDasharray="3 3"
        />
        {placedX !== null ? (
          <line
            x1={placedX}
            x2={placedX}
            y1={8}
            y2={H - padB}
            stroke="#22d3ee"
            strokeDasharray="4 3"
            strokeWidth="1"
          />
        ) : null}
        <path
          d={line}
          fill="none"
          stroke={last >= 0 ? "#22c55e" : "#f43f5e"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-1 text-xs text-slate-400">
        Latest open PnL:{" "}
        <span className={last >= 0 ? "text-emerald-300" : "text-rose-300"}>
          ${last.toFixed(2)}
        </span>
      </p>
      {placedAt ? (
        <p className="mt-1 text-xs text-cyan-300">
          Bet placed: {new Date(placedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

export function MarketDetailModal({
  market,
  latestSignal,
  open,
  onClose,
  onRunAnalysis,
  onSimulate,
  runExecuting = false,
  strategies = [],
  selectedStrategyId = "",
  onStrategyChange,
  recentAnalyses = [],
  simulations = [],
  onDeleteSimulation,
}: MarketDetailModalProps) {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [selectedSimulationId, setSelectedSimulationId] = useState("");
  const [simulationSeries, setSimulationSeries] = useState<
    SimulationPnlPoint[]
  >([]);
  const [simulationSeriesLoading, setSimulationSeriesLoading] = useState(false);
  const [simulationSeriesError, setSimulationSeriesError] = useState<
    string | null
  >(null);
  const [simulationPlacedAt, setSimulationPlacedAt] = useState<number | null>(
    null,
  );
  const [deletingSimulationId, setDeletingSimulationId] = useState<
    string | null
  >(null);

  const activeSimulationId = simulations.some(
    (s) => s.id === selectedSimulationId,
  )
    ? selectedSimulationId
    : (simulations[0]?.id ?? "");
  const currentMarketId = market?.id ?? "";

  useEffect(() => {
    if (!open || !market?.clobTokenId) return;
    const tokenId = market.clobTokenId;
    const ac = new AbortController();

    const load = async () => {
      setPriceLoading(true);
      setPriceError(null);
      try {
        const res = await fetch(
          `https://clob.polymarket.com/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=60`,
          { signal: ac.signal },
        );
        if (!res.ok) throw new Error(`CLOB API returned ${res.status}`);
        const data = (await res.json()) as { history: PricePoint[] };
        setPriceHistory(data.history ?? []);
      } catch (err) {
        if (ac.signal.aborted) return;
        setPriceError(
          err instanceof Error ? err.message : "Failed to load price history",
        );
      } finally {
        if (!ac.signal.aborted) setPriceLoading(false);
      }
    };

    void load();
    return () => ac.abort();
  }, [open, market?.clobTokenId]);

  useEffect(() => {
    if (!open || !activeSimulationId || !currentMarketId) {
      setSimulationSeries([]);
      setSimulationSeriesLoading(false);
      setSimulationSeriesError(null);
      setSimulationPlacedAt(null);
      return;
    }
    const ac = new AbortController();

    const loadSeries = async () => {
      setSimulationSeriesLoading(true);
      setSimulationSeriesError(null);
      try {
        const res = await fetch(`/api/simulations/${activeSimulationId}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`Simulation API returned ${res.status}`);
        const data = (await res.json()) as {
          session?: {
            history?: SimulationHistoryItem[];
            positions?: SimulationPositionItem[];
          };
        };
        const history = (data.session?.history ?? []).filter(
          (item) => item.marketId === currentMarketId,
        );
        const marketPositions = (data.session?.positions ?? []).filter(
          (pos) => pos.marketId === currentMarketId,
        );
        const placedAtTs = marketPositions
          .map((pos) => new Date(pos.createdAt).getTime())
          .filter((ts) => Number.isFinite(ts))
          .sort((a, b) => a - b)[0];
        setSimulationPlacedAt(Number.isFinite(placedAtTs) ? placedAtTs : null);
        const pnlByTime = new Map<number, number>();
        for (const item of history) {
          const ts = new Date(item.takenAt).getTime();
          if (!Number.isFinite(ts)) continue;
          pnlByTime.set(ts, (pnlByTime.get(ts) ?? 0) + item.pnl);
        }
        const points = Array.from(pnlByTime.entries())
          .map(([t, pnl]) => ({ t, pnl }))
          .sort((a, b) => a.t - b.t);
        setSimulationSeries(points);
      } catch (err) {
        if (ac.signal.aborted) return;
        setSimulationSeriesError(
          err instanceof Error
            ? err.message
            : "Failed to load simulation chart",
        );
        setSimulationPlacedAt(null);
      } finally {
        if (!ac.signal.aborted) setSimulationSeriesLoading(false);
      }
    };

    void loadSeries();
    return () => ac.abort();
  }, [activeSimulationId, currentMarketId, open]);

  if (!open || !market) return null;

  const hasSignal = Boolean(latestSignal);
  const venueUrl = resolveMarketVenueUrl(market);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6">
      <Card className="w-full max-w-5xl border-slate-700 bg-slate-900 shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl text-slate-100">
                Market Analytics
              </CardTitle>
              <p className="mt-1 text-xl font-medium text-slate-200">
                {market.question}
              </p>
            </div>
            {venueUrl ? (
              <a
                href={venueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                Open on{" "}
                {market.conditionId || market.venue === "polymarket"
                  ? "Polymarket"
                  : "Kalshi"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="rounded-2xl bg-slate-800/50 p-5">
              <p className="text-sm text-slate-400">
                Current YES price (% and $/share)
              </p>
              <p className="mt-1 text-4xl font-bold text-slate-100">
                {formatPercent(market.probability)}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {formatSharePrice(market.probability)} per $1 payout share
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {priceHistory.length > 0
                  ? `${priceHistory.length} price points`
                  : priceLoading
                    ? "Loading history…"
                    : market.clobTokenId
                      ? "No history data"
                      : "No token ID"}
              </p>

              <div className="mt-6 space-y-2 text-sm text-slate-400">
                <p>
                  Market liquidity:{" "}
                  <span className="font-semibold text-slate-200">
                    ${formatVolume(market.liquidity)}
                  </span>
                </p>
                <p>
                  Total volume:{" "}
                  <span className="font-semibold text-slate-200">
                    ${formatVolume(market.volume)}
                  </span>
                </p>
                <p>
                  Implied chance:{" "}
                  <span className="font-semibold text-slate-200">
                    {formatPercent(market.probability)}
                  </span>
                </p>
                <p>
                  Expires:{" "}
                  <span className="font-semibold text-slate-200">
                    {market.endDate
                      ? new Date(market.endDate).toLocaleDateString()
                      : "Unknown"}
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                YES / NO Price History (% probability, equivalent $/share)
              </p>
              <PriceHistoryChart
                history={priceHistory}
                loading={priceLoading}
                error={priceError}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Latest Analysis
            </p>
            {hasSignal && latestSignal ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`text-sm font-semibold ${actionColor(latestSignal.action)}`}
                  >
                    {latestSignal.action}
                  </span>
                  <span className="text-sm text-slate-300">
                    {latestSignal.signalType.replace("_", " ")}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {(latestSignal.confidence * 100).toFixed(0)}% confidence
                  </span>
                  {Number.isFinite(latestSignal.fairPrice) ? (
                    <span className="rounded-full bg-cyan-900/40 px-2 py-0.5 text-xs text-cyan-300">
                      Fair value {formatPercent(latestSignal.fairPrice ?? 0)}
                    </span>
                  ) : null}
                </div>
                {latestSignal.reasoningSections ? (
                  <div className="space-y-1 text-xs text-slate-400">
                    <p>
                      <span className="font-medium text-slate-500">
                        Context:{" "}
                      </span>
                      {latestSignal.reasoningSections.marketContext}
                    </p>
                    <p>
                      <span className="font-medium text-slate-500">
                        Verdict:{" "}
                      </span>
                      {latestSignal.reasoningSections.finalVerdict}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">
                    {latestSignal.reasoning}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Generated {new Date(latestSignal.createdAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                No stored analysis yet. Run Analysis to generate one.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Recent Analyses For This Market
            </p>
            {recentAnalyses.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                No recent run history loaded for this market yet.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {recentAnalyses.slice(0, 5).map((item) => (
                  <div
                    key={`${item.runId}-${item.createdAt}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        {item.strategyName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.signalType.replace("_", " ")} • {item.action} •{" "}
                        {(item.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Simulation Sessions
            </p>
            {simulations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">
                No simulation sessions yet. Use Simulate to create or add to a
                session.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <Select
                  value={activeSimulationId}
                  onValueChange={setSelectedSimulationId}
                >
                  <SelectTrigger className="w-full border-slate-700 bg-slate-800 text-sm text-slate-200">
                    <SelectValue placeholder="Select simulation" />
                  </SelectTrigger>
                  <SelectContent>
                    {simulations.map((sim) => (
                      <SelectItem key={sim.id} value={sim.id}>
                        {sim.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SimulationPnlChart
                  points={simulationSeries}
                  loading={simulationSeriesLoading}
                  error={simulationSeriesError}
                  placedAt={simulationPlacedAt}
                />
                {simulations.slice(0, 4).map((sim) => (
                  <div
                    key={sim.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-slate-200">{sim.name}</p>
                      <p className="text-xs text-slate-500">
                        {sim.status} • {sim.positionCount ?? 0} positions
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      Bet ${sim.betSize.toFixed(0)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deletingSimulationId === sim.id}
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `Delete simulation \"${sim.name}\"? This cannot be undone.`,
                        );
                        if (!confirmed) return;
                        setDeletingSimulationId(sim.id);
                        try {
                          if (onDeleteSimulation) {
                            await onDeleteSimulation(sim.id);
                          } else {
                            const res = await fetch(
                              `/api/simulations/${sim.id}`,
                              {
                                method: "DELETE",
                              },
                            );
                            if (!res.ok) {
                              throw new Error(`Delete failed: ${res.status}`);
                            }
                          }
                        } catch (err) {
                          setSimulationSeriesError(
                            err instanceof Error
                              ? err.message
                              : "Failed to delete simulation",
                          );
                        } finally {
                          setDeletingSimulationId(null);
                        }
                      }}
                    >
                      {deletingSimulationId === sim.id
                        ? "Deleting..."
                        : "Delete"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Simulate opens the quick simulation flow with this market&apos;s
              latest signal.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {onRunAnalysis ? (
              <div className="flex flex-wrap items-center gap-2">
                {strategies.length > 0 ? (
                  <Select
                    value={selectedStrategyId}
                    onValueChange={onStrategyChange}
                  >
                    <SelectTrigger className="w-44 border-slate-700 bg-slate-800 text-sm text-slate-200">
                      <SelectValue placeholder="Select strategy…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ADD_NEW_STRATEGY_VALUE}>
                        + Add new strategy
                      </SelectItem>
                      {strategies.map((s) => (
                        <SelectItem
                          key={s.id}
                          value={s.id}
                          title={
                            s.description?.trim() || "No strategy description"
                          }
                        >
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button
                  variant="outline"
                  disabled={
                    runExecuting ||
                    (strategies.length > 0 && !selectedStrategyId)
                  }
                  onClick={onRunAnalysis}
                >
                  {runExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {runExecuting ? "Analyzing..." : "Run Analysis"}
                </Button>
              </div>
            ) : null}
            {onSimulate ? (
              <Button
                variant="outline"
                disabled={!hasSignal || runExecuting}
                title={
                  hasSignal
                    ? "Simulate using latest analysis"
                    : "Run analysis first to enable simulation"
                }
                onClick={onSimulate}
              >
                Simulate
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={onClose}
              className="bg-slate-800 text-white hover:bg-slate-700"
            >
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
