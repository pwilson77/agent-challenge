"use client";

import {
  ResponsiveContainer,
  RadialBarChart,
  PolarAngleAxis,
  RadialBar,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Signal } from "@/lib/types";

interface StatsOverviewProps {
  signals: Signal[];
  marketCount: number;
}

export function StatsOverview({ signals, marketCount }: StatsOverviewProps) {
  const avgConfidence =
    signals.length === 0
      ? 0
      : signals.reduce((acc, signal) => acc + signal.confidence, 0) /
        signals.length;

  const buyCount = signals.filter((signal) => signal.action === "BUY").length;
  const sellCount = signals.filter((signal) => signal.action === "SELL").length;
  const monitorCount = signals.filter(
    (signal) => signal.action === "MONITOR",
  ).length;

  return (
    <section
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      aria-label="Live Signal Summary"
    >
      <Card className="flex min-h-44 flex-col">
        <CardHeader className="items-center pb-2 text-center">
          <CardTitle className="text-sm text-slate-400">
            Tracked Markets
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-center">
          <p className="text-3xl font-bold text-slate-100">{marketCount}</p>
        </CardContent>
      </Card>

      <Card className="flex min-h-44 flex-col">
        <CardHeader className="items-center pb-2 text-center">
          <CardTitle className="text-sm text-slate-400">
            Signals Generated
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-center">
          <p className="text-3xl font-bold text-slate-100">{signals.length}</p>
        </CardContent>
      </Card>

      <Card className="flex min-h-44 flex-col">
        <CardHeader className="items-center pb-2 text-center">
          <CardTitle className="text-sm text-slate-400">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center text-center">
          <div className="space-y-1 text-sm">
            <p className="text-emerald-300">BUY: {buyCount}</p>
            <p className="text-rose-300">SELL: {sellCount}</p>
            <p className="text-amber-300">MONITOR: {monitorCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-44 min-w-0 flex-col">
        <CardHeader className="items-center pb-2 text-center">
          <CardTitle className="text-sm text-slate-400">
            Avg Confidence
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center min-w-0">
          <div className="h-32 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="55%"
                outerRadius="100%"
                barSize={10}
                data={[{ value: Math.round(avgConfidence * 100) }]}
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={10} fill="#22d3ee" />
                <text
                  x="50%"
                  y="60%"
                  textAnchor="middle"
                  className="fill-slate-100 text-lg font-semibold"
                >
                  {Math.round(avgConfidence * 100)}%
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
