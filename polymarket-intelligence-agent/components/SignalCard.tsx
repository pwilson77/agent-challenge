"use client";

import { ExternalLink } from "lucide-react";

import { ReasoningBreadcrumbs } from "@/components/ReasoningBreadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function actionLabel(action: Signal["action"]): string {
  if (action === "BUY") return "BUY YES";
  if (action === "SELL") return "BUY NO";
  return "MONITOR";
}

function valuationBadge(signal: Signal): {
  label: string;
  className: string;
} | null {
  if (!Number.isFinite(signal.fairPrice)) return null;
  const gap = (signal.fairPrice ?? 0) - signal.probability;
  if (gap >= 0.03) {
    return {
      label: "UNDERVALUED",
      className:
        "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
    };
  }
  if (gap <= -0.03) {
    return {
      label: "OVERVALUED",
      className: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
    };
  }
  return {
    label: "NEAR FAIR",
    className: "bg-slate-700 text-slate-300",
  };
}

function buildExecutionUrl(signal: Signal): string | null {
  if (!signal.conditionId) return null;
  const outcome =
    signal.action === "BUY"
      ? "yes"
      : signal.action === "SELL"
        ? "no"
        : undefined;
  const base = `https://polymarket.com/market/${signal.conditionId}`;
  return outcome ? `${base}?outcome=${outcome}` : base;
}

export function SignalCard({ signal }: SignalCardProps) {
  const valuation = valuationBadge(signal);
  const executionUrl = buildExecutionUrl(signal);

  return (
    <Card className="h-full border-slate-800 bg-slate-900/60">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-6 text-slate-100">
            {signal.market}
          </CardTitle>
          <Badge variant={actionBadge(signal.action)}>
            {actionLabel(signal.action)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{signal.signal.replace("_", " ")}</Badge>
          {valuation ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${valuation.className}`}
            >
              {valuation.label}
            </span>
          ) : null}
          <span className="text-xs text-slate-400">
            Confidence: {(signal.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <CardDescription className="text-slate-400">
          Probability:{" "}
          <span className="font-semibold text-slate-200">
            {formatPercent(signal.probability)}
          </span>
        </CardDescription>
        {Number.isFinite(signal.fairPrice) ? (
          <CardDescription className="text-slate-400">
            Fair Value: {formatPercent(signal.fairPrice ?? 0)}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <ReasoningBreadcrumbs signal={signal} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {new Date(signal.timestamp).toLocaleString()}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={!executionUrl}
            onClick={() => {
              if (!executionUrl) return;
              window.open(executionUrl, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="h-4 w-4" />
            Execute on Polymarket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
