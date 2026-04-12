export interface Market {
  id: string;
  conditionId?: string;
  clobTokenId?: string;
  outcomes?: string[];
  outcomePrices?: number[];
  outcomeTokenIds?: string[];
  question: string;
  probability: number;
  volume: number;
  liquidity: number;
  endDate?: string;
}

export interface Signal {
  market: string;
  probability: number;
  signal: "MISPRICED" | "MOMENTUM" | "ARBITRAGE" | "BREAKING_NEWS";
  confidence: number;
  reasoning: string;
  action: "BUY" | "SELL" | "MONITOR";
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface MarketsResponse {
  markets: Market[];
  updatedAt: string;
  source: "polymarket" | "mock";
  pagination?: PaginationMeta;
}

export interface SignalsResponse {
  signals: Signal[];
  updatedAt: string;
  source: "eliza" | "mock";
}

export interface Strategy {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  promptTemplate: string;
  batchSize: number;
  active: boolean;
  scheduleEnabled: boolean;
  scheduleCron?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedSignal {
  id: string;
  marketId: string;
  marketQuestion: string;
  signalType: Signal["signal"];
  confidence: number;
  reasoning: string;
  action: Signal["action"];
  createdAt: string;
}

export interface StrategyRun {
  id: string;
  strategyId: string;
  strategyName: string;
  status: "pending" | "running" | "completed" | "failed";
  batchSize: number;
  selectedCount: number;
  signalCount: number;
  batchesCompleted: number;
  errorMsg?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  runtimeMs?: number | null;
  createdAt: string;
  updatedAt: string;
  signals?: PersistedSignal[];
}

// ── Paper-trading simulation types ───────────────────────────────────────────

export interface SimulationSession {
  id: string;
  name: string;
  status: "active" | "paused" | "stopped";
  betSize: number;
  interval: "1h" | "4h" | "1d" | "custom";
  intervalMin?: number | null;
  nextTickAt?: string | null;
  createdAt: string;
  updatedAt: string;
  positions?: SimulationPosition[];
  /** Aggregate across all open positions — only present on list responses */
  totalPnl?: number;
  positionCount?: number;
}

export interface SimulationPosition {
  id: string;
  sessionId: string;
  marketId: string;
  clobTokenId?: string | null;
  marketQuestion: string;
  action: "BUY" | "SELL";
  betSize: number;
  entryProbability: number;
  shares: number;
  status: "open" | "closed";
  closedAt?: string | null;
  closeProbability?: number | null;
  realizedPnl?: number | null;
  createdAt: string;
  snapshots?: SimulationSnapshot[];
  /** Latest computed open PnL — only present on detail responses */
  currentProbability?: number;
  openPnl?: number;
}

export interface SimulationSnapshot {
  id: string;
  sessionId: string;
  positionId: string;
  probability: number;
  value: number;
  pnl: number;
  takenAt: string;
}
