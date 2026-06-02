import { NextRequest, NextResponse } from "next/server";
import { annotateCandles, detectPatterns, STRAT_PATTERNS } from "@/lib/thestrat";
import type { Asset, Candle } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

const INTERVAL_MAP: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D",
};
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000,
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

async function fetchHLCandles(coin: string, interval: string, limit: number): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - (INTERVAL_MS[interval] ?? 3_600_000) * limit;
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval: INTERVAL_MAP[interval] ?? "60", startTime, endTime },
    }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("HL candle fetch failed");
  const data = await res.json();
  return data.map((c: any) => ({
    time: c.t / 1000,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { asset, stratPattern, direction, timeframe = "1h" } = await req.json();

    const candles = await fetchHLCandles(asset as Asset, timeframe, 60);
    if (candles.length < 4) {
      return NextResponse.json({ signal: false, reason: "Not enough candles" });
    }

    const annotated = annotateCandles(candles);
    const matches = detectPatterns(annotated, 50);

    // If a specific pattern name was requested, filter to that
    const relevant = stratPattern
      ? matches.filter((m) => m.pattern.name === stratPattern)
      : matches;

    // Further filter by direction if specified
    const dirFiltered = direction && direction !== "both"
      ? relevant.filter((m) =>
          (direction === "long" && m.pattern.direction === "bullish") ||
          (direction === "short" && m.pattern.direction === "bearish")
        )
      : relevant;

    if (dirFiltered.length === 0) {
      // Return all detected patterns even if no match for the strategy
      return NextResponse.json({
        signal: false,
        reason: "No matching pattern detected",
        detectedPatterns: matches.slice(-5).map((m) => ({
          name: m.pattern.name,
          direction: m.pattern.direction,
          type: m.pattern.type,
          actionable: m.pattern.actionable,
        })),
        lastCandles: annotated.slice(-5).map((c) => ({
          time: c.time,
          stratType: c.stratType,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      });
    }

    // Use the most recent match
    const best = dirFiltered[dirFiltered.length - 1];
    const lastCandle = annotated[annotated.length - 1];
    const currentPrice = lastCandle.close;

    // Entry at current close, SL/TP based on last candle range
    const candleRange = lastCandle.high - lastCandle.low;
    const isBullish = best.pattern.direction === "bullish";

    const suggestedEntry = currentPrice;
    const suggestedSL = isBullish
      ? lastCandle.low - candleRange * 0.1
      : lastCandle.high + candleRange * 0.1;
    const suggestedTP = isBullish
      ? currentPrice + candleRange * 2
      : currentPrice - candleRange * 2;

    return NextResponse.json({
      signal: true,
      pattern: best.pattern.name,
      direction: isBullish ? "long" : "short",
      actionable: best.pattern.actionable,
      patternType: best.pattern.type,
      description: best.pattern.description,
      suggestedEntry,
      suggestedSL,
      suggestedTP,
      currentPrice,
      detectedPatterns: matches.slice(-5).map((m) => ({
        name: m.pattern.name,
        direction: m.pattern.direction,
        type: m.pattern.type,
        actionable: m.pattern.actionable,
      })),
      lastCandles: annotated.slice(-5).map((c) => ({
        time: c.time,
        stratType: c.stratType,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    });
  } catch (e: any) {
    console.error("paper/scan error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Scan failed" }, { status: 500 });
  }
}
