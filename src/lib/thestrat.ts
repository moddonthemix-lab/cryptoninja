import type { Candle } from "@/types";

// Candle type per TheStrat methodology
export type StratCandleType = 1 | "2U" | "2D" | 3;

export interface StratCandle extends Candle {
  stratType: StratCandleType;
  label: string;
}

export interface StratPattern {
  name: string;
  candles: StratCandleType[];
  direction: "bullish" | "bearish" | "neutral";
  description: string;
  type: "reversal" | "continuation" | "expansion";
  actionable: boolean; // true = not yet triggered, false = in-force (already triggered)
}

// Classify a candle relative to the previous candle
export function classifyCandleType(current: Candle, previous: Candle): StratCandleType {
  const currHigh = current.high;
  const currLow = current.low;
  const prevHigh = previous.high;
  const prevLow = previous.low;

  const takesOutHigh = currHigh > prevHigh;
  const takesOutLow = currLow < prevLow;

  if (takesOutHigh && takesOutLow) return 3;          // Outside bar
  if (!takesOutHigh && !takesOutLow) return 1;        // Inside bar
  if (takesOutHigh && !takesOutLow) return "2U";      // Directional up
  return "2D";                                         // Directional down
}

// Annotate an array of candles with their TheStrat types
export function annotateCandles(candles: Candle[]): StratCandle[] {
  return candles.map((candle, i) => {
    if (i === 0) {
      return { ...candle, stratType: 1, label: "1" };
    }
    const type = classifyCandleType(candle, candles[i - 1]);
    return {
      ...candle,
      stratType: type,
      label: String(type),
    };
  });
}

// All TheStrat patterns with their candle sequences
export const STRAT_PATTERNS: StratPattern[] = [
  // ── Actionable patterns (entry not yet triggered) ──
  {
    name: "2-1-1 Bullish Continuation",
    candles: ["2U", 1, 1],
    direction: "bullish",
    type: "continuation",
    actionable: true,
    description: "Directional up, two inside bars — breakout above last inside bar high",
  },
  {
    name: "2-1-1 Bearish Continuation",
    candles: ["2D", 1, 1],
    direction: "bearish",
    type: "continuation",
    actionable: true,
    description: "Directional down, two inside bars — breakout below last inside bar low",
  },
  {
    name: "2-1-1 Bullish Reversal",
    candles: ["2D", 1, 1],
    direction: "bullish",
    type: "reversal",
    actionable: true,
    description: "Down trend pauses with inside bars, potential reversal to upside",
  },
  {
    name: "3-1-1 Bullish Reversal",
    candles: [3, 1, 1],
    direction: "bullish",
    type: "reversal",
    actionable: true,
    description: "Outside bar followed by two inside bars — buy break of inside bar high",
  },
  {
    name: "3-1-1 Bearish Reversal",
    candles: [3, 1, 1],
    direction: "bearish",
    type: "reversal",
    actionable: true,
    description: "Outside bar followed by two inside bars — sell break of inside bar low",
  },
  {
    name: "3-2-1 Bullish Reversal",
    candles: [3, "2U", 1],
    direction: "bullish",
    type: "reversal",
    actionable: true,
    description: "Outside, directional up, inside — buy break above inside bar high",
  },
  {
    name: "3-2-1 Bearish Reversal",
    candles: [3, "2D", 1],
    direction: "bearish",
    type: "reversal",
    actionable: true,
    description: "Outside, directional down, inside — sell break below inside bar low",
  },
  {
    name: "1-2-1 Bullish Reversal",
    candles: [1, "2U", 1],
    direction: "bullish",
    type: "reversal",
    actionable: true,
    description: "Inside bar, break up, then inside — buy break of second inside high",
  },
  {
    name: "1-2-1 Bearish Reversal",
    candles: [1, "2D", 1],
    direction: "bearish",
    type: "reversal",
    actionable: true,
    description: "Inside bar, break down, then inside — sell break of second inside low",
  },

  // ── In-force patterns (already triggered, pullback entry) ──
  {
    name: "2-1-2 Bullish Continuation",
    candles: ["2U", 1, "2U"],
    direction: "bullish",
    type: "continuation",
    actionable: false,
    description: "Up trend confirmed with inside consolidation — momentum continues",
  },
  {
    name: "2-1-2 Bearish Continuation",
    candles: ["2D", 1, "2D"],
    direction: "bearish",
    type: "continuation",
    actionable: false,
    description: "Down trend confirmed with inside consolidation — momentum continues",
  },
  {
    name: "2-1-2 Bullish Reversal",
    candles: ["2D", 1, "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Down move, consolidation, then up breakout — reversal confirmed",
  },
  {
    name: "2-1-2 Bearish Reversal",
    candles: ["2U", 1, "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Up move, consolidation, then down break — reversal confirmed",
  },
  {
    name: "3-1-2 Bullish Reversal",
    candles: [3, 1, "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Outside bar, inside consolidation, upward break — bullish",
  },
  {
    name: "3-1-2 Bearish Reversal",
    candles: [3, 1, "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Outside bar, inside consolidation, downward break — bearish",
  },
  {
    name: "3-2-2 Bullish Reversal",
    candles: [3, "2D", "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Outside bar, down move, then up — momentum shift confirmed",
  },
  {
    name: "3-2-2 Bearish Reversal",
    candles: [3, "2U", "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Outside bar, up move, then down — momentum shift confirmed",
  },
  {
    name: "1-2-2 Bullish Reversal",
    candles: [1, "2U", "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Inside bar followed by two consecutive up moves — strong reversal",
  },
  {
    name: "1-2-2 Bearish Reversal",
    candles: [1, "2D", "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Inside bar followed by two consecutive down moves — strong reversal",
  },
  {
    name: "2-2 Bullish Continuation",
    candles: ["2U", "2U"],
    direction: "bullish",
    type: "continuation",
    actionable: false,
    description: "Two consecutive directional up bars — strong bullish momentum",
  },
  {
    name: "2-2 Bearish Continuation",
    candles: ["2D", "2D"],
    direction: "bearish",
    type: "continuation",
    actionable: false,
    description: "Two consecutive directional down bars — strong bearish momentum",
  },
  {
    name: "2-2 Bullish Reversal",
    candles: ["2D", "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Down then up — short-term reversal signal",
  },
  {
    name: "2-2 Bearish Reversal",
    candles: ["2U", "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Up then down — short-term reversal signal",
  },
  {
    name: "1-2 Bullish Reversal",
    candles: [1, "2U"],
    direction: "bullish",
    type: "reversal",
    actionable: false,
    description: "Inside bar breaks up — entry on break of inside high",
  },
  {
    name: "1-2 Bearish Reversal",
    candles: [1, "2D"],
    direction: "bearish",
    type: "reversal",
    actionable: false,
    description: "Inside bar breaks down — entry on break of inside low",
  },
  {
    name: "1-3 Bullish Reversal",
    candles: [1, 3],
    direction: "bullish",
    type: "expansion",
    actionable: false,
    description: "Inside bar followed by outside bar — range expansion",
  },
  {
    name: "1-3 Bearish Reversal",
    candles: [1, 3],
    direction: "bearish",
    type: "expansion",
    actionable: false,
    description: "Inside bar followed by outside bar — range expansion",
  },
];

// Detect patterns in the last N candles of an annotated array
export function detectPatterns(
  annotated: StratCandle[],
  lookback: number = 50
): Array<{ pattern: StratPattern; candles: StratCandle[]; index: number }> {
  const recent = annotated.slice(-lookback);
  const found: Array<{ pattern: StratPattern; candles: StratCandle[]; index: number }> = [];

  for (const pattern of STRAT_PATTERNS) {
    const len = pattern.candles.length;
    for (let i = len - 1; i < recent.length; i++) {
      const slice = recent.slice(i - len + 1, i + 1);
      const matches = slice.every((c, j) => c.stratType === pattern.candles[j]);
      if (matches) {
        found.push({ pattern, candles: slice, index: annotated.length - lookback + i });
      }
    }
  }

  return found;
}

// Get the most recent pattern from annotated candles
export function getLatestPattern(
  annotated: StratCandle[]
): { pattern: StratPattern; candles: StratCandle[] } | null {
  const results = detectPatterns(annotated, 30);
  if (results.length === 0) return null;
  // Return the most recently detected (highest index)
  return results[results.length - 1];
}

// Full Time Frame Continuity check across multiple timeframe datasets
export function checkTimeframeContinuity(
  datasets: { tf: string; candles: StratCandle[] }[]
): { allBullish: boolean; allBearish: boolean; summary: string } {
  const directions = datasets.map(({ tf, candles }) => {
    if (candles.length < 2) return { tf, direction: "neutral" as const };
    const last = candles[candles.length - 1];
    if (last.stratType === "2U") return { tf, direction: "bullish" as const };
    if (last.stratType === "2D") return { tf, direction: "bearish" as const };
    if (last.close > last.open) return { tf, direction: "bullish" as const };
    return { tf, direction: "bearish" as const };
  });

  const allBullish = directions.every((d) => d.direction === "bullish");
  const allBearish = directions.every((d) => d.direction === "bearish");

  const summary = directions
    .map((d) => `${d.tf}: ${d.direction === "bullish" ? "↑" : d.direction === "bearish" ? "↓" : "→"}`)
    .join(" | ");

  return { allBullish, allBearish, summary };
}

// Color for candle type label
export function stratTypeColor(type: StratCandleType): string {
  if (type === 1) return "#64748b";
  if (type === "2U") return "#10b981";
  if (type === "2D") return "#ef4444";
  return "#f59e0b";
}

export function stratTypeLabel(type: StratCandleType): string {
  return String(type);
}
