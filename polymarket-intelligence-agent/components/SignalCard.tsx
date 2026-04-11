import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Signal } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

interface SignalCardProps {
  signal: Signal;
}

function actionBadge(action: Signal["action"]): "buy" | "sell" | "monitor" {
  if (action === "BUY") return "buy";
  if (action === "SELL") return "sell";
  return "monitor";
}

export function SignalCard({ signal }: SignalCardProps) {
  return (
    <Card className="h-full border-slate-800 bg-slate-900/60">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-6 text-slate-100">{signal.market}</CardTitle>
          <Badge variant={actionBadge(signal.action)}>{signal.action}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{signal.signal.replace("_", " ")}</Badge>
          <span className="text-xs text-slate-400">Confidence: {(signal.confidence * 100).toFixed(0)}%</span>
        </div>
        <CardDescription className="text-slate-400">
          Probability: <span className="font-semibold text-slate-200">{formatPercent(signal.probability)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm leading-6 text-slate-300">{signal.reasoning}</p>
        <p className="text-xs text-slate-500">{new Date(signal.timestamp).toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
