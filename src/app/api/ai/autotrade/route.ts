import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Candle } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

type BarType = "1" | "2U" | "2D" | "3";
type TFDirection = "bullish" | "bearish" | "neutral";
type FTFCResult = "bullish" | "bearish" | "mixed";

// ─── Candle fetching ──────────────────────────────────────────────────────────

async function fetchCandles(coin: string, interval: string, limit: number): Promise<Candle[]> {
  const endTime = Date.now();
  const msPerBar = INTERVAL_MS[interval] ?? 3_600_000;
  const startTime = endTime - msPerBar * (limit + 2);

  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } }),
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Candle fetch failed for ${coin} ${interval}`);

  const data: Array<{ t: number; o: string; h: string; l: string; c: string; v: string }> = await res.json();
  return data.map((c) => ({
    time: c.t / 1000,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

// ─── TheStrat helpers ─────────────────────────────────────────────────────────

function classifyBar(curr: Candle, prev: Candle): BarType {
  const tookOutHigh = curr.high > prev.high;
  const tookOutLow = curr.low < prev.low;
  if (tookOutHigh && tookOutLow) return "3";
  if (tookOutHigh && !tookOutLow) return "2U";
  if (!tookOutHigh && tookOutLow) return "2D";
  return "1";
}

function getTFDirection(candles: Candle[]): TFDirection {
  if (candles.length < 2) return "neutral";
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const barType = classifyBar(curr, prev);
  if (barType === "2U") return "bullish";
  if (barType === "2D") return "bearish";
  if (barType === "3") {
    const mid = (curr.high + curr.low) / 2;
    return curr.close > mid ? "bullish" : "bearish";
  }
  return "neutral";
}

function calcFTFC(weeklyDir: TFDirection, dailyDir: TFDirection): FTFCResult {
  if (weeklyDir === "bullish" && dailyDir === "bullish") return "bullish";
  if (weeklyDir === "bearish" && dailyDir === "bearish") return "bearish";
  return "mixed";
}

function checkBreakAndHold(candles5m: Candle[], level: number, direction: "bullish" | "bearish"): boolean {
  if (candles5m.length < 2) return false;
  const mostRecentClose = candles5m[candles5m.length - 1].close;
  if (direction === "bullish") {
    return candles5m.some((c) => c.close > level) && mostRecentClose > level;
  }
  return candles5m.some((c) => c.close < level) && mostRecentClose < level;
}

// ─── Goldbach / PO3 helpers ───────────────────────────────────────────────────

// Powers of 3 sequence used for dealing range sizes
const PO3_SEQUENCE = [3, 9, 27, 81, 243, 729, 2187, 6561, 19683];

// Find the nearest PO3 value to a given number (e.g. ADR)
function nearestPO3(value: number): number {
  return PO3_SEQUENCE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

// Calculate the average daily range over the last N candles
function calcADR(dailyCandles: Candle[], n = 20): number {
  const recent = dailyCandles.slice(-n);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
}

// Derive the current PO3 dealing range partition that price sits in
function calcDealingRange(currentPrice: number, po3Size: number): { low: number; high: number } {
  const partitionIndex = Math.floor(currentPrice / po3Size);
  return { low: partitionIndex * po3Size, high: (partitionIndex + 1) * po3Size };
}

// The 14 Goldbach levels as % of the dealing range, from the book:
// prime pairs that sum to 100, spaced 6% apart (except top/bottom at 3%)
// 0/100=boundary, 3/97=rejection block, 11/89=order block, 17/83=FVG,
// 29/71=liquidity void, 41/59=breaker, 47/53=equilibrium
const GB_PERCENTAGES = [0, 3, 11, 17, 29, 41, 47, 53, 59, 71, 83, 89, 97, 100] as const;
const GB_NAMES = [
  "rangeLow", "rejBlockLow", "orderBlockLow", "fvgLow",
  "liqVoidLow", "breakerLow", "equilLow",
  "equilHigh", "breakerHigh", "liqVoidHigh",
  "fvgHigh", "orderBlockHigh", "rejBlockHigh", "rangeHigh",
] as const;

type GoldbachLevels = Record<typeof GB_NAMES[number], number>;

function calcGoldbachLevels(rangeLow: number, rangeHigh: number): GoldbachLevels {
  const range = rangeHigh - rangeLow;
  return Object.fromEntries(
    GB_NAMES.map((name, i) => [name, rangeLow + range * (GB_PERCENTAGES[i] / 100)])
  ) as GoldbachLevels;
}

// Find which Goldbach level is nearest to current price, and the % distance
function nearestGoldbachLevel(price: number, levels: GoldbachLevels): {
  name: string; level: number; distPct: number;
} {
  let nearest = { name: "", level: 0, distPct: Infinity };
  for (const [name, level] of Object.entries(levels)) {
    const distPct = Math.abs((price - level) / level) * 100;
    if (distPct < nearest.distPct) nearest = { name, level, distPct };
  }
  return nearest;
}

// The Goldbach trade plan defines which level to target given an entry level.
// Based on Goldbach algorithms from the book (ALGO 1 and ALGO 2).
function goldbachTpLevel(entryLevelName: string, direction: "bullish" | "bearish", levels: GoldbachLevels): number | null {
  // For longs (bullish): entry at a discount level, target the paired premium level
  // For shorts (bearish): entry at a premium level, target the paired discount level
  const longMap: Record<string, keyof GoldbachLevels> = {
    orderBlockLow: "breakerHigh",   // OB plan: enter OB (11%), target breaker (59%)
    fvgLow: "breakerLow",           // FVG plan: enter FVG (17%), target breaker (41%)
    liqVoidLow: "equilHigh",        // LV: target equilibrium (53%)
    breakerLow: "orderBlockHigh",   // Breaker plan: target OB (89%)
    equilLow: "equilHigh",          // Equilibrium: target opposite equil (53%)
    rejBlockLow: "orderBlockHigh",  // Rejection: target OB
    rangeLow: "breakerHigh",        // Range low: target breaker
  };
  const shortMap: Record<string, keyof GoldbachLevels> = {
    orderBlockHigh: "breakerLow",
    fvgHigh: "breakerHigh",
    liqVoidHigh: "equilLow",
    breakerHigh: "orderBlockLow",
    equilHigh: "equilLow",
    rejBlockHigh: "orderBlockLow",
    rangeHigh: "breakerLow",
  };
  const map = direction === "bullish" ? longMap : shortMap;
  const targetKey = map[entryLevelName];
  return targetKey ? levels[targetKey] : null;
}

// Detect a recent stop run: price swept a short-term high/low then reversed
function detectStopRun(candles5m: Candle[]): { detected: boolean; direction?: "bullish" | "bearish"; sweptLevel?: number } {
  if (candles5m.length < 6) return { detected: false };
  const recent = candles5m.slice(-6);
  const latest = recent[recent.length - 1];

  // Look for a large wick that reversed: high wick + bearish close = bearish stop run (swept highs)
  // low wick + bullish close = bullish stop run (swept lows, now going up)
  for (let i = 1; i < recent.length - 1; i++) {
    const c = recent[i];
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const bodySize = Math.abs(c.close - c.open);

    // Bullish stop run: swept lows (big lower wick), latest candle now above the wick candle's close
    if (lowerWick > bodySize * 1.5 && lowerWick > 0 && latest.close > c.close) {
      return { detected: true, direction: "bullish", sweptLevel: c.low };
    }
    // Bearish stop run: swept highs (big upper wick), latest candle now below the wick candle's close
    if (upperWick > bodySize * 1.5 && upperWick > 0 && latest.close < c.close) {
      return { detected: true, direction: "bearish", sweptLevel: c.high };
    }
  }
  return { detected: false };
}

// AMD session phase based on UTC hour
// London/Manipulation: 04:00-10:00 UTC | NY/Distribution: 10:00-20:00 UTC | Asia/Accumulation: rest
function getAMDPhase(utcHour: number): "accumulation" | "manipulation" | "distribution" {
  if (utcHour >= 4 && utcHour < 10) return "manipulation";
  if (utcHour >= 10 && utcHour < 20) return "distribution";
  return "accumulation";
}

// ─── Claude client ────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { asset, leverage = 3 } = await req.json();

    const [weeklyCandles, dailyCandles, h4Candles, candles5m, btcDailyCandles, btcH4Candles] =
      await Promise.all([
        fetchCandles(asset, "1d", 21), // 21 days for ADR-20 + weekly proxy
        fetchCandles(asset, "1d", 5),
        fetchCandles(asset, "4h", 10),
        fetchCandles(asset, "5m", 30),
        fetchCandles("BTC", "1d", 5),
        fetchCandles("BTC", "4h", 10),
      ]);

    if (dailyCandles.length < 3 || h4Candles.length < 3 || candles5m.length < 5) {
      return NextResponse.json({ shouldTrade: false, reason: "Insufficient candle data" });
    }

    // ── TheStrat: bar classification + FTFC ───────────────────────────────
    const weeklyDir = getTFDirection(weeklyCandles);
    const dailyDir = getTFDirection(dailyCandles);
    const h4Dir = getTFDirection(h4Candles);
    const btcDailyDir = getTFDirection(btcDailyCandles);
    const btcH4Dir = getTFDirection(btcH4Candles);

    const lastDaily = dailyCandles[dailyCandles.length - 1];
    const prevDaily = dailyCandles[dailyCandles.length - 2];
    const lastH4 = h4Candles[h4Candles.length - 1];
    const prevH4 = h4Candles[h4Candles.length - 2];

    const dailyBarType = classifyBar(lastDaily, prevDaily);
    const h4BarType = classifyBar(lastH4, prevH4);
    const assetFTFC = calcFTFC(weeklyDir, dailyDir);

    const btcFTFC = calcFTFC(btcDailyDir, btcH4Dir);
    const btcAgreesWithAsset =
      (btcFTFC === "bullish" && assetFTFC === "bullish") ||
      (btcFTFC === "bearish" && assetFTFC === "bearish");
    const btcConflicts =
      (btcFTFC === "bullish" && assetFTFC === "bearish") ||
      (btcFTFC === "bearish" && assetFTFC === "bullish");

    // ── TheStrat: key levels + break-and-hold ─────────────────────────────
    const priorDayCandle = dailyCandles[dailyCandles.length - 2];
    const priorDayHigh = priorDayCandle?.high ?? 0;
    const priorDayLow = priorDayCandle?.low ?? 0;

    const priorWeekSlice = weeklyCandles.slice(0, 7);
    const priorWeekHigh = priorWeekSlice.length > 0 ? Math.max(...priorWeekSlice.map((c) => c.high)) : priorDayHigh * 1.05;
    const priorWeekLow = priorWeekSlice.length > 0 ? Math.min(...priorWeekSlice.map((c) => c.low)) : priorDayLow * 0.95;

    const breakAndHoldBull = checkBreakAndHold(candles5m, priorDayHigh, "bullish");
    const breakAndHoldBear = checkBreakAndHold(candles5m, priorDayLow, "bearish");
    const currentPrice = candles5m[candles5m.length - 1].close;

    // ── Goldbach: dealing range + levels ──────────────────────────────────
    const adr = calcADR(weeklyCandles, 20);
    const po3Size = nearestPO3(adr);
    const dealingRange = calcDealingRange(currentPrice, po3Size);
    const gbLevels = calcGoldbachLevels(dealingRange.low, dealingRange.high);
    const nearestGB = nearestGoldbachLevel(currentPrice, gbLevels);
    const atGBLevel = nearestGB.distPct < 1.5; // within 1.5% of a Goldbach level
    const gbTpLevel = goldbachTpLevel(nearestGB.name, assetFTFC as "bullish" | "bearish", gbLevels);
    const gbTpDistPct = gbTpLevel ? Math.abs((gbTpLevel - currentPrice) / currentPrice) * 100 : null;

    // ── Goldbach: stop run + AMD phase ────────────────────────────────────
    const stopRun = detectStopRun(candles5m);
    const amdPhase = getAMDPhase(new Date().getUTCHours());
    const inManipulation = amdPhase === "manipulation";

    // ── FTFC gate (same as before) ────────────────────────────────────────
    if (assetFTFC === "mixed") {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC mixed — weekly=${weeklyDir}, daily=${dailyDir}. No clear bias.`,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, dailyBarType, h4BarType,
      });
    }

    const requiredBreakAndHold = assetFTFC === "bullish" ? breakAndHoldBull : breakAndHoldBear;
    if (!requiredBreakAndHold) {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC ${assetFTFC} but 5-min break-and-hold not confirmed on ${assetFTFC === "bullish" ? "priorDayHigh" : "priorDayLow"} ($${(assetFTFC === "bullish" ? priorDayHigh : priorDayLow).toFixed(2)})`,
        ftfc: assetFTFC, priorDayHigh, priorDayLow, weeklyDir, dailyDir, h4Dir, dailyBarType, h4BarType,
      });
    }

    const distToNextKeyLevelPct = assetFTFC === "bullish"
      ? ((priorWeekHigh - currentPrice) / currentPrice) * 100
      : ((currentPrice - priorWeekLow) / currentPrice) * 100;

    // ── Build Claude context ──────────────────────────────────────────────
    const last5min = candles5m.slice(-5).map((c) =>
      `  ${new Date(c.time * 1000).toISOString().slice(11, 16)} o:${c.open.toFixed(2)} h:${c.high.toFixed(2)} l:${c.low.toFixed(2)} c:${c.close.toFixed(2)}`
    ).join("\n");

    const gbLevelsList = Object.entries(gbLevels)
      .map(([name, lvl]) => `  ${name.padEnd(18)}: $${(lvl as number).toFixed(2)}`)
      .join("\n");

    const contextBlock = `
ASSET: ${asset}/USDT  |  PRICE: $${currentPrice.toFixed(2)}  |  LEVERAGE: ${leverage}x

=== THESTRAT MULTI-TIMEFRAME ANALYSIS ===
Weekly (proxy)   : ${weeklyDir}
Daily            : ${dailyDir}  [bar: ${dailyBarType}]
4H               : ${h4Dir}    [bar: ${h4BarType}]
FTFC             : ${assetFTFC.toUpperCase()}

=== BTC MARKET FILTER ===
BTC Daily/4H FTFC: ${btcFTFC.toUpperCase()}
Alignment        : ${btcAgreesWithAsset ? "AGREES ✓ (high confidence)" : btcConflicts ? "CONFLICTS ✗ (reduce confidence)" : "neutral"}

=== THESTRAT KEY LEVELS ===
priorDayHigh : $${priorDayHigh.toFixed(2)}
priorDayLow  : $${priorDayLow.toFixed(2)}
priorWeekHigh: $${priorWeekHigh.toFixed(2)}
priorWeekLow : $${priorWeekLow.toFixed(2)}
Break-and-hold ${assetFTFC === "bullish" ? "ABOVE priorDayHigh" : "BELOW priorDayLow"}: CONFIRMED

=== GOLDBACH DEALING RANGE (PO3 = ${po3Size}) ===
ADR (20-day avg) : $${adr.toFixed(2)}
Range            : $${dealingRange.low.toFixed(2)} → $${dealingRange.high.toFixed(2)}
Current price    : $${currentPrice.toFixed(2)} (${(((currentPrice - dealingRange.low) / (dealingRange.high - dealingRange.low)) * 100).toFixed(1)}% of range)

Goldbach levels:
${gbLevelsList}

Nearest GB level : ${nearestGB.name} ($${nearestGB.level.toFixed(2)}, ${nearestGB.distPct.toFixed(2)}% away)
AT Goldbach level: ${atGBLevel ? "YES ✓ — strong entry zone" : "NO — not at a key level yet"}
${gbTpLevel ? `Goldbach TP target: ${Object.entries(gbLevels).find(([, v]) => v === gbTpLevel)?.[0] ?? ""} = $${gbTpLevel.toFixed(2)} (${gbTpDistPct?.toFixed(2)}% away)` : ""}

=== AMD + STOP RUN ===
Session phase    : ${amdPhase.toUpperCase()}${inManipulation ? " ✓ (ideal entry window: London Open)" : ""}
Stop run detected: ${stopRun.detected ? `YES — ${stopRun.direction} (swept $${stopRun.sweptLevel?.toFixed(2)})` : "NO"}

=== LAST 5×5-MIN CANDLES ===
${last5min}

=== RISK RULES ===
SL fixed at 30% of margin = ±${((0.30 / leverage) * 100).toFixed(2)}% price move at ${leverage}x.
TP: prefer Goldbach target level when price is AT a GB level.
If not at GB level, use distance to next TheStrat key level.
Manipulation phase (London Open) + stop run + GB level = highest confidence.
Equilibrium zone (47-53%) entries → smaller TP. OB/FVG entries → larger TP.
`.trim();

    // ── No API key: rule-based fallback ──────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      const direction = assetFTFC === "bullish" ? "long" : "short";
      let confidence = 60;
      if ((assetFTFC === "bullish" && h4Dir === "bullish") || (assetFTFC === "bearish" && h4Dir === "bearish")) confidence += 10;
      if (btcAgreesWithAsset) confidence += 10;
      if (btcConflicts) confidence -= 10;
      if (atGBLevel) confidence += 15;
      if (stopRun.detected && stopRun.direction === direction.replace("long", "bullish").replace("short", "bearish")) confidence += 10;
      if (inManipulation) confidence += 5;

      // Prefer Goldbach TP if available and closer than the TheStrat level
      let tpPct: number;
      if (gbTpLevel && gbTpDistPct !== null && gbTpDistPct < distToNextKeyLevelPct) {
        tpPct = Math.round(Math.min(100, Math.max(25, gbTpDistPct * leverage)));
      } else if (distToNextKeyLevelPct > 5) tpPct = 80;
      else if (distToNextKeyLevelPct < 2) tpPct = 30;
      else tpPct = 50;

      if (h4Dir === "neutral") tpPct = Math.round(tpPct * 0.7);

      const slPricePct = 0.30 / leverage;
      const tpPricePct = tpPct / 100 / leverage;
      const isSwing = (dailyBarType === "2U" || dailyBarType === "2D") && h4Dir !== "neutral" && btcAgreesWithAsset;

      return NextResponse.json({
        shouldTrade: true, direction, leverage,
        confidence: Math.min(100, Math.max(0, confidence)),
        tpPct, slPct: 30, isSwing,
        entry: currentPrice,
        sl: direction === "long" ? currentPrice * (1 - slPricePct) : currentPrice * (1 + slPricePct),
        tp: direction === "long" ? currentPrice * (1 + tpPricePct) : currentPrice * (1 - tpPricePct),
        reasoning: `Rule-based: FTFC ${assetFTFC}, ${dailyBarType}/${h4BarType}, BTC ${btcFTFC}. ${atGBLevel ? `At GB level (${nearestGB.name}).` : ""} ${stopRun.detected ? "Stop run detected." : ""} ${inManipulation ? "London session." : ""}`,
        trailTriggerPct: 20, trailRetreatPct: 35,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, dailyBarType, h4BarType, btcFTFC,
        priorDayHigh, priorDayLow, priorWeekHigh, priorWeekLow,
        goldbachLevel: nearestGB.name, goldbachLevelPrice: nearestGB.level, atGoldbachLevel: atGBLevel,
        goldbachTp: gbTpLevel, amdPhase, stopRunDetected: stopRun.detected,
      });
    }

    // ── Claude path ───────────────────────────────────────────────────────
    const prompt = `You are an expert crypto trader combining TheStrat (Rob Smith) and Goldbach trading methodologies.
All pre-conditions have been verified: FTFC is ${assetFTFC} and 5-min break-and-hold is confirmed.

${contextBlock}

GOLDBACH TRADING RULES (from the Goldbach book):
- BEST entries occur when price is AT a Goldbach level (within 1-2%) during the Manipulation phase (London Open) after a stop run
- Goldbach entry hierarchy: Order Block (11/89%) > FVG (17/83%) > Breaker (41/59%) > Equilibrium (47/53%)
- Goldbach TP: OB entry (11%) → target Breaker (59%); FVG entry (17%) → target Breaker (41%); Breaker (41%) → target OB (89%); Equil (47%) → target opposite equil (53%)
- Stop run (price sweeps a high/low then reverses) INTO a Goldbach level = highest probability setup
- If NOT at a Goldbach level: reduce confidence significantly, prefer smaller TP
- AMD: Manipulation phase (London Open 04:00-10:00 UTC) is the ideal entry window
- Combined with TheStrat FTFC: Goldbach gives entry precision, TheStrat gives directional bias

Decide:
1. shouldTrade: Is this a high-probability entry? (false if not near a GB level AND no stop run AND not in manipulation phase)
2. direction: "long" or "short" per FTFC
3. confidence: 0-100 (boost if: at GB level +15, stop run detected +10, manipulation phase +10, BTC agrees +10)
4. tpPct: 25-100 (% of margin). Prefer Goldbach TP level distance × leverage. If Goldbach TP = 3% price move at 5x leverage → 15% margin. Cap at 100.
5. isSwing: true if daily 2U/2D + full MTF + BTC agrees + at OB/FVG level
6. trailTriggerPct: 15-40
7. trailRetreatPct: 20-45
8. reasoning: one sentence mentioning the Goldbach level and AMD phase

Return ONLY this JSON:
{
  "shouldTrade": true or false,
  "direction": "long" or "short",
  "confidence": 0-100,
  "tpPct": 25-100,
  "isSwing": true or false,
  "trailTriggerPct": 15-40,
  "trailRetreatPct": 20-45,
  "reasoning": "one sentence"
}`;

    const msg = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");
    const ai = JSON.parse(jsonMatch[0]);

    if (!ai.shouldTrade) {
      return NextResponse.json({
        shouldTrade: false,
        reason: ai.reasoning ?? "Claude declined the trade",
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, dailyBarType, h4BarType, btcFTFC,
        priorDayHigh, priorDayLow, goldbachLevel: nearestGB.name, amdPhase,
      });
    }

    const direction: "long" | "short" = ai.direction === "short" ? "short" : "long";
    const tpPct = Math.min(100, Math.max(25, ai.tpPct ?? 50));
    const slPricePct = 0.30 / leverage;
    const tpPricePct = tpPct / 100 / leverage;

    return NextResponse.json({
      shouldTrade: true, direction, leverage,
      confidence: Math.min(100, Math.max(0, ai.confidence ?? 60)),
      tpPct, slPct: 30, isSwing: ai.isSwing ?? false,
      entry: currentPrice,
      sl: direction === "long" ? currentPrice * (1 - slPricePct) : currentPrice * (1 + slPricePct),
      tp: direction === "long" ? currentPrice * (1 + tpPricePct) : currentPrice * (1 - tpPricePct),
      reasoning: ai.reasoning ?? "",
      trailTriggerPct: ai.trailTriggerPct ?? 20,
      trailRetreatPct: ai.trailRetreatPct ?? 35,
      ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, dailyBarType, h4BarType,
      btcFTFC, btcAgreesWithAsset, btcConflicts,
      priorDayHigh, priorDayLow, priorWeekHigh, priorWeekLow, distToNextKeyLevelPct,
      goldbachLevel: nearestGB.name, goldbachLevelPrice: nearestGB.level,
      atGoldbachLevel: atGBLevel, goldbachTp: gbTpLevel,
      po3Size, dealingRangeLow: dealingRange.low, dealingRangeHigh: dealingRange.high,
      amdPhase, stopRunDetected: stopRun.detected,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("autotrade error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
