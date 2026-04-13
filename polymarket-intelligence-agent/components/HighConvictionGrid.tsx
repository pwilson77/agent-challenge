import { ExternalLink } from "lucide-react";

import type { Signal } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface HighConvictionGridProps {
  signals: Signal[];
  getSignalLink?: (signal: Signal) => string | null;
}

function convictionTone(action: Signal["action"]): string {
  if (action === "BUY") {
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-100";
  }
  if (action === "SELL") {
    return "border-rose-500/50 bg-rose-500/10 text-rose-100";
  }
  return "border-slate-700 bg-slate-900/40 text-slate-100";
}

function actionText(action: Signal["action"]): string {
  if (action === "BUY") return "Bullish • BUY YES";
  if (action === "SELL") return "Bearish • BUY NO";
  return "Monitor";
}

export function HighConvictionGrid({
  signals,
  getSignalLink,
}: HighConvictionGridProps) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          High Conviction Signals
        </h2>
        <span className="text-xs text-slate-500">Confidence &gt; 80%</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal) => {
          const link = getSignalLink?.(signal) ?? null;
          return (
            <article
              key={`${signal.market}-${signal.timestamp}`}
              className={`rounded-lg border p-3 ${convictionTone(signal.action)}`}
            >
              <p className="line-clamp-2 text-sm font-medium">
                {signal.market}
              </p>
              <p className="mt-2 text-xs opacity-90">
                {actionText(signal.action)}
              </p>
              <div className="mt-3 flex items-end justify-between text-xs">
                <span>Confidence {(signal.confidence * 100).toFixed(0)}%</span>
                <span>{formatPercent(signal.probability)}</span>
              </div>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                >
                  Open on venue
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
