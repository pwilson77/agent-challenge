export interface Market {
  id: string;
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
