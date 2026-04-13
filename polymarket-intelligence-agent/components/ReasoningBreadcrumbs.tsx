"use client";

import { useEffect, useMemo, useState } from "react";

import type { Signal } from "@/lib/types";

interface ReasoningBreadcrumbsProps {
  signal: Signal;
}

function deriveSections(signal: Signal) {
  if (signal.reasoningSections) {
    return signal.reasoningSections;
  }

  const lines = signal.reasoning
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    marketContext: lines[0] ?? signal.reasoning,
    sentimentAnalysis: lines[1] ?? lines[0] ?? signal.reasoning,
    finalVerdict: lines.at(-1) ?? signal.reasoning,
  };
}

function useTypewriter(text: string, active: boolean, speedMs = 11): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= text.length) {
          window.clearInterval(id);
          return text.length;
        }
        return next;
      });
    }, speedMs);

    return () => window.clearInterval(id);
  }, [active, speedMs, text]);

  if (!active) return text;
  return text.slice(0, index);
}

function TypewriterLine({ text, active }: { text: string; active: boolean }) {
  const rendered = useTypewriter(text, active);
  return <p className="mt-1 leading-6">{rendered}</p>;
}

export function ReasoningBreadcrumbs({ signal }: ReasoningBreadcrumbsProps) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const sections = useMemo(() => deriveSections(signal), [signal]);

  return (
    <div className="rounded-md border border-slate-800/70 bg-slate-950/30 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) setSeed((current) => current + 1);
            return next;
          });
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Reasoning Breadcrumbs
        </span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 text-sm text-slate-300">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Market Context
            </p>
            <TypewriterLine
              key={`${seed}-context`}
              text={sections.marketContext}
              active={open}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Sentiment Analysis
            </p>
            <TypewriterLine
              key={`${seed}-sentiment`}
              text={sections.sentimentAnalysis}
              active={open}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Final Verdict
            </p>
            <TypewriterLine
              key={`${seed}-verdict`}
              text={sections.finalVerdict}
              active={open}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
