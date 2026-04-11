import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Market, PersistedSignal } from "@/lib/types";
import { formatPercent, formatVolume } from "@/lib/utils";

interface MarketDetailModalProps {
  market: Market | null;
  latestSignal?: PersistedSignal;
  open: boolean;
  onClose: () => void;
}

export function MarketDetailModal({
  market,
  latestSignal,
  open,
  onClose,
}: MarketDetailModalProps) {
  if (!open || !market) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
      <Card className="w-full max-w-2xl border-slate-700 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-100">Market Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Question
            </p>
            <p className="mt-1 text-sm text-slate-100">{market.question}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Probability
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {formatPercent(market.probability)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Volume
              </p>
              <p className="mt-1 text-sm text-slate-200">
                ${formatVolume(market.volume)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Liquidity
              </p>
              <p className="mt-1 text-sm text-slate-200">
                ${formatVolume(market.liquidity)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                End Date
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {market.endDate
                  ? new Date(market.endDate).toLocaleString()
                  : "Unknown"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Latest Analysis Summary
            </p>
            {latestSignal ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-slate-200">
                  {latestSignal.signalType} • {latestSignal.action} •{" "}
                  {(latestSignal.confidence * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-slate-300">
                  {latestSignal.reasoning}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(latestSignal.createdAt).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                No stored analysis summary yet.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
