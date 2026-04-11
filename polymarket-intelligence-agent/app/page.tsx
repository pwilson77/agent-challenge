import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.17),transparent_38%),radial-gradient(circle_at_80%_5%,rgba(59,130,246,0.15),transparent_32%)]" />

      <main className="relative z-10 mx-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/70 p-8 shadow-2xl backdrop-blur md:p-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Sparkles className="h-3.5 w-3.5" />
          AI Market Edge
        </div>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-100 md:text-6xl">
          Polymarket Intelligence Agent
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
          Your Personal AI for Detecting Mispriced Prediction Markets
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard" className="inline-flex items-center gap-2">
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <span className="inline-flex items-center gap-1 text-sm text-slate-400">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            Refreshes every 60 seconds
          </span>
        </div>
      </main>
    </div>
  );
}
