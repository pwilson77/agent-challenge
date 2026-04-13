import { clamp } from "@/lib/utils";
import type { Market, MarketComparison } from "@/lib/types";

const MIN_SIMILARITY = 0.45;

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "will",
  "by",
  "of",
  "to",
  "in",
  "for",
  "and",
  "on",
  "at",
  "be",
  "is",
  "are",
]);

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function jaccardSimilarity(a: string, b: string): number {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isEndDateCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  const aTs = new Date(a).getTime();
  const bTs = new Date(b).getTime();
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs)) return true;
  const daysDiff = Math.abs(aTs - bTs) / (1000 * 60 * 60 * 24);
  return daysDiff <= 21;
}

function makeComparisonId(polyId: string, kalshiId: string): string {
  return `${polyId}__${kalshiId}`;
}

export function buildMarketComparisons(
  polymarket: Market[],
  kalshi: Market[],
  options?: { threshold?: number; maxResults?: number },
): MarketComparison[] {
  const threshold = clamp(options?.threshold ?? 0.05, 0.01, 0.5);
  const maxResults = Math.max(options?.maxResults ?? 50, 1);

  const usedKalshi = new Set<string>();
  const comparisons: MarketComparison[] = [];

  for (const poly of polymarket) {
    let best: { market: Market; similarity: number } | null = null;

    for (const k of kalshi) {
      if (usedKalshi.has(k.id)) continue;
      if (!isEndDateCompatible(poly.endDate, k.endDate)) continue;

      const similarity = jaccardSimilarity(poly.question, k.question);
      if (similarity < MIN_SIMILARITY) continue;

      if (!best || similarity > best.similarity) {
        best = { market: k, similarity };
      }
    }

    if (!best) continue;
    usedKalshi.add(best.market.id);

    const probabilityGap =
      clamp(poly.probability, 0, 1) - clamp(best.market.probability, 0, 1);
    const absoluteGap = Math.abs(probabilityGap);

    comparisons.push({
      id: makeComparisonId(poly.id, best.market.id),
      question: poly.question,
      polymarket: { ...poly, venue: "polymarket" },
      kalshi: { ...best.market, venue: "kalshi" },
      probabilityGap,
      absoluteGap,
      recommendation:
        probabilityGap > 0 ? "BUY_KALSHI_YES" : "BUY_POLYMARKET_YES",
      thresholdHit: absoluteGap >= threshold,
      similarityScore: best.similarity,
    });
  }

  return comparisons
    .sort((a, b) => b.absoluteGap - a.absoluteGap)
    .slice(0, maxResults);
}
