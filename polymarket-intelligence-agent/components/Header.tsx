import Link from "next/link";
import { Activity, BrainCircuit } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group inline-flex items-center gap-2">
          <span className="rounded-md bg-cyan-500/15 p-2 text-cyan-300 transition-colors group-hover:bg-cyan-500/25">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">Polymarket Intelligence Agent</p>
            <p className="text-xs text-slate-400">AI-powered signal discovery</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard" className="inline-flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
