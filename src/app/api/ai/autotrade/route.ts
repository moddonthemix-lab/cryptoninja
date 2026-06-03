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

// Check if 5m price has broken and held above/below a given level
function checkBreakAndHold(candles5m: Candle[], level: number, direction: "bullish" | "bearish"): boolean {
  if (candles5m.length < 2) return false;
  const mostRecentClose = candles5m[candles5m.length - 1].close;
  if (direction === "bullish") return candles5m.some((c) => c.close > level) && mostRecentClose > level;
  return candles5m.some((c) => c.close < level) && mostRecentClose < level;
}

// Prior candle high/low (second-to-last closed candle)
function priorHL(candles: Candle[]): { high: number; low: number } {
  const c = candles[candles.length - 2];
  return c ? { high: c.high, low: c.low } : { high: 0, low: 0 };
}

// ─── Goldbach / PO3 helpers ───────────────────────────────────────────────────

const PO3_SEQUENCE = [3, 9, 27, 81, 243, 729, 2187, 6561, 19683];

function nearestPO3(value: number): number {
  return PO3_SEQUENCE.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

function calcAverageRange(candles: Candle[], n = 20): number {
  const recent = candles.slice(-n);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + (c.high - c.low), 0) / recent.length;
}

function calcDealingRange(currentPrice: number, po3Size: number): { low: number; high: number } {
  const idx = Math.floor(currentPrice / po3Size);
  return { low: idx * po3Size, high: (idx + 1) * po3Size };
}

// Goldbach levels: 14 price points at fixed % of dealing range
// prime pairs summing to 100, spaced 6% apart
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

function nearestGoldbachLevel(price: number, levels: GoldbachLevels): { name: string; level: number; distPct: number } {
  let nearest = { name: "", level: 0, distPct: Infinity };
  for (const [name, level] of Object.entries(levels)) {
    const distPct = Math.abs((price - (level as number)) / (level as number)) * 100;
    if (distPct < nearest.distPct) nearest = { name, level: level as number, distPct };
  }
  return nearest;
}

// Goldbach positional bias: where is price in the dealing range?
// Discount (<47%) = bullish GB bias, Premium (>53%) = bearish GB bias, Equil = neutral
function goldbachBias(price: number, rangeLow: number, rangeHigh: number): "bullish" | "bearish" | "neutral" {
  const pct = ((price - rangeLow) / (rangeHigh - rangeLow)) * 100;
  if (pct < 47) return "bullish";   // discount zone — expect move to premium
  if (pct > 53) return "bearish";   // premium zone — expect move to discount
  return "neutral";                  // equilibrium zone
}

// TP target per Goldbach trade plan (ALGO 1 / ALGO 2 from the book)
function goldbachTpLevel(entryLevelName: string, direction: "bullish" | "bearish", levels: GoldbachLevels): number | null {
  const longMap: Record<string, keyof GoldbachLevels> = {
    orderBlockLow:  "breakerHigh",    // OB (11%) → Breaker (59%)
    fvgLow:         "breakerLow",     // FVG (17%) → Breaker (41%)
    liqVoidLow:     "equilHigh",      // LV (29%) → Equil (53%)
    breakerLow:     "orderBlockHigh", // Breaker (41%) → OB (89%)
    equilLow:       "equilHigh",      // Equil (47%) → opposite equil (53%)
    rejBlockLow:    "orderBlockHigh",
    rangeLow:       "breakerHigh",
  };
  const shortMap: Record<string, keyof GoldbachLevels> = {
    orderBlockHigh: "breakerLow",
    fvgHigh:        "breakerHigh",
    liqVoidHigh:    "equilLow",
    breakerHigh:    "orderBlockLow",
    equilHigh:      "equilLow",
    rejBlockHigh:   "orderBlockLow",
    rangeHigh:      "breakerLow",
  };
  const key = (direction === "bullish" ? longMap : shortMap)[entryLevelName];
  return key ? levels[key] : null;
}

// Detect 5m stop run: big wick followed by reversal
function detectStopRun(candles5m: Candle[]): { detected: boolean; direction?: "bullish" | "bearish"; sweptLevel?: number } {
  if (candles5m.length < 6) return { detected: false };
  const recent = candles5m.slice(-6);
  const latest = recent[recent.length - 1];
  for (let i = 1; i < recent.length - 1; i++) {
    const c = recent[i];
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const body = Math.abs(c.close - c.open);
    if (lowerWick > body * 1.5 && lowerWick > 0 && latest.close > c.close)
      return { detected: true, direction: "bullish", sweptLevel: c.low };
    if (upperWick > body * 1.5 && upperWick > 0 && latest.close < c.close)
      return { detected: true, direction: "bearish", sweptLevel: c.high };
  }
  return { detected: false };
}

// AMD session (UTC)
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

    // Fetch all timeframes in parallel
    const [
      weeklyCandles, dailyCandles,
      h4Candles, h1Candles,
      candles5m,
      btcDailyCandles, btcH4Candles,
    ] = await Promise.all([
      fetchCandles(asset, "1d", 21),   // weekly proxy via daily
      fetchCandles(asset, "1d", 5),
      fetchCandles(asset, "4h", 10),
      fetchCandles(asset, "1h", 24),   // 1H — last 24 hours
      fetchCandles(asset, "5m", 30),
      fetchCandles("BTC", "1d", 5),
      fetchCandles("BTC", "4h", 10),
    ]);

    if (dailyCandles.length < 3 || h4Candles.length < 3 || candles5m.length < 5) {
      return NextResponse.json({ shouldTrade: false, reason: "Insufficient candle data" });
    }

    const currentPrice = candles5m[candles5m.length - 1].close;

    // ── TheStrat bar types across all timeframes ──────────────────────────
    const weeklyDir  = getTFDirection(weeklyCandles);
    const dailyDir   = getTFDirection(dailyCandles);
    const h4Dir      = getTFDirection(h4Candles);
    const h1Dir      = getTFDirection(h1Candles);
    const btcDailyDir = getTFDirection(btcDailyCandles);
    const btcH4Dir   = getTFDirection(btcH4Candles);

    const dailyBarType = classifyBar(dailyCandles[dailyCandles.length - 1], dailyCandles[dailyCandles.length - 2]);
    const h4BarType   = classifyBar(h4Candles[h4Candles.length - 1], h4Candles[h4Candles.length - 2]);
    const h1BarType   = h1Candles.length >= 2 ? classifyBar(h1Candles[h1Candles.length - 1], h1Candles[h1Candles.length - 2]) : "1" as BarType;

    // FTFC: weekly + daily gate (core TheStrat requirement)
    const assetFTFC = calcFTFC(weeklyDir, dailyDir);

    // Count how many intraday TFs agree with FTFC direction (1H, 4H)
    const intradayTFs = [h1Dir, h4Dir];
    const intradayAgreement = intradayTFs.filter(
      d => (assetFTFC === "bullish" && d === "bullish") || (assetFTFC === "bearish" && d === "bearish")
    ).length;

    const btcFTFC = calcFTFC(btcDailyDir, btcH4Dir);
    const btcAgreesWithAsset =
      (btcFTFC === "bullish" && assetFTFC === "bullish") ||
      (btcFTFC === "bearish" && assetFTFC === "bearish");
    const btcConflicts =
      (btcFTFC === "bullish" && assetFTFC === "bearish") ||
      (btcFTFC === "bearish" && assetFTFC === "bullish");

    // ── Prior highs/lows across all timeframes ────────────────────────────
    const priorDay  = priorHL(dailyCandles);
    const priorH4   = priorHL(h4Candles);
    const priorH1   = priorHL(h1Candles);

    const priorWeekSlice = weeklyCandles.slice(0, 7);
    const priorWeekHigh = priorWeekSlice.length > 0 ? Math.max(...priorWeekSlice.map(c => c.high)) : priorDay.high * 1.05;
    const priorWeekLow  = priorWeekSlice.length > 0 ? Math.min(...priorWeekSlice.map(c => c.low))  : priorDay.low  * 0.95;

    // 5-min break-and-hold checked in BOTH directions on each timeframe:
    // Bullish BnH = 5m breaks ABOVE prior candle high and holds → long confirmation
    // Bearish BnH = 5m breaks BELOW prior candle low and holds  → short confirmation
    const bh = {
      dailyBull: checkBreakAndHold(candles5m, priorDay.high, "bullish"),
      dailyBear: checkBreakAndHold(candles5m, priorDay.low,  "bearish"),
      h4Bull:    checkBreakAndHold(candles5m, priorH4.high,  "bullish"),
      h4Bear:    checkBreakAndHold(candles5m, priorH4.low,   "bearish"),
      h1Bull:    h1Candles.length >= 2 && checkBreakAndHold(candles5m, priorH1.high, "bullish"),
      h1Bear:    h1Candles.length >= 2 && checkBreakAndHold(candles5m, priorH1.low,  "bearish"),
    };

    const bullishBHCount = [bh.dailyBull, bh.h4Bull, bh.h1Bull].filter(Boolean).length;
    const bearishBHCount = [bh.dailyBear, bh.h4Bear, bh.h1Bear].filter(Boolean).length;

    // Which direction the 5m is actually confirming right now
    const bhDetectedDir = bullishBHCount > bearishBHCount ? "bullish"
      : bearishBHCount > bullishBHCount ? "bearish"
      : "mixed";

    // Valid when detected direction matches FTFC (at least 1 TF confirmed)
    const breakAndHoldConfirmed = assetFTFC === "bullish"
      ? bullishBHCount >= 1
      : bearishBHCount >= 1;

    // ── Goldbach: multi-timeframe dealing ranges and bias ─────────────────
    // Main dealing range uses daily ADR (macro view)
    const adr = calcAverageRange(weeklyCandles, 20);
    const po3Main = nearestPO3(adr);
    const drMain = calcDealingRange(currentPrice, po3Main);
    const gbMain = calcGoldbachLevels(drMain.low, drMain.high);
    const nearestGB = nearestGoldbachLevel(currentPrice, gbMain);
    const atGBLevel = nearestGB.distPct < 1.5;
    const gbTpLevel = goldbachTpLevel(nearestGB.name, assetFTFC as "bullish" | "bearish", gbMain);
    const gbTpDistPct = gbTpLevel ? Math.abs((gbTpLevel - currentPrice) / currentPrice) * 100 : null;

    // Goldbach directional bias per timeframe (discount=bull, premium=bear)
    // Each TF uses an appropriately-sized PO3 range
    const avgH4Range = calcAverageRange(h4Candles, 10);
    const avgH1Range = calcAverageRange(h1Candles, 20);

    const po3H4 = nearestPO3(avgH4Range);
    const po3H1 = nearestPO3(avgH1Range);

    const drH4 = calcDealingRange(currentPrice, po3H4);
    const drH1 = calcDealingRange(currentPrice, po3H1);

    const gbBiasDaily = goldbachBias(currentPrice, drMain.low, drMain.high);
    const gbBiasH4    = goldbachBias(currentPrice, drH4.low, drH4.high);
    const gbBiasH1    = goldbachBias(currentPrice, drH1.low, drH1.high);

    // Count how many TF GB biases agree with FTFC
    const gbBiases = [gbBiasDaily, gbBiasH4, gbBiasH1];
    const gbAgreement = gbBiases.filter(
      b => (assetFTFC === "bullish" && b === "bullish") || (assetFTFC === "bearish" && b === "bearish")
    ).length;

    // ── AMD + stop run ────────────────────────────────────────────────────
    const stopRun = detectStopRun(candles5m);
    const amdPhase = getAMDPhase(new Date().getUTCHours());
    const inManipulation = amdPhase === "manipulation";

    // ── FTFC gate ─────────────────────────────────────────────────────────
    if (assetFTFC === "mixed") {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC mixed — weekly=${weeklyDir}, daily=${dailyDir}. No clear bias.`,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir, dailyBarType, h4BarType,
      });
    }

    if (!breakAndHoldConfirmed) {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC ${assetFTFC} but 5m BnH detected as ${bhDetectedDir} — needs ${assetFTFC} (daily: bull=${bh.dailyBull}/bear=${bh.dailyBear}, 4H: bull=${bh.h4Bull}/bear=${bh.h4Bear}, 1H: bull=${bh.h1Bull}/bear=${bh.h1Bear})`,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir,
        priorDayHigh: priorDay.high, priorDayLow: priorDay.low,
        priorH4High: priorH4.high, priorH4Low: priorH4.low,
        priorH1High: priorH1.high, priorH1Low: priorH1.low,
      });
    }

    const distToNextKeyLevelPct = assetFTFC === "bullish"
      ? ((priorWeekHigh - currentPrice) / currentPrice) * 100
      : ((currentPrice - priorWeekLow) / currentPrice) * 100;

    // ── Context block for Claude ──────────────────────────────────────────
    const last5min = candles5m.slice(-5).map((c) =>
      `  ${new Date(c.time * 1000).toISOString().slice(11, 16)} o:${c.open.toFixed(2)} h:${c.high.toFixed(2)} l:${c.low.toFixed(2)} c:${c.close.toFixed(2)}`
    ).join("\n");

    const gbLevelsList = Object.entries(gbMain)
      .map(([name, lvl]) => `  ${name.padEnd(18)}: $${(lvl as number).toFixed(2)}`)
      .join("\n");

    const pctInRange = (((currentPrice - drMain.low) / (drMain.high - drMain.low)) * 100).toFixed(1);

    const contextBlock = `
ASSET: ${asset}/USDT  |  PRICE: $${currentPrice.toFixed(2)}  |  LEVERAGE: ${leverage}x

=== THESTRAT MULTI-TIMEFRAME ===
Weekly  : ${weeklyDir}
Daily   : ${dailyDir}  [bar: ${dailyBarType}]
4H      : ${h4Dir}    [bar: ${h4BarType}]
1H      : ${h1Dir}    [bar: ${h1BarType}]
FTFC    : ${assetFTFC.toUpperCase()}
Intraday alignment (1H/4H agree): ${intradayAgreement}/2 TFs

=== BTC MARKET FILTER ===
BTC FTFC : ${btcFTFC.toUpperCase()}
Alignment: ${btcAgreesWithAsset ? "AGREES ✓" : btcConflicts ? "CONFLICTS ✗" : "neutral"}

=== MULTI-TF KEY LEVELS ===
priorWeekHigh: $${priorWeekHigh.toFixed(2)} / Low: $${priorWeekLow.toFixed(2)}
priorDayHigh : $${priorDay.high.toFixed(2)} / Low: $${priorDay.low.toFixed(2)}  — 5m BnH bull=${bh.dailyBull ? "✓" : "✗"} bear=${bh.dailyBear ? "✓" : "✗"}
prior4H High : $${priorH4.high.toFixed(2)} / Low: $${priorH4.low.toFixed(2)}   — 5m BnH bull=${bh.h4Bull ? "✓" : "✗"} bear=${bh.h4Bear ? "✓" : "✗"}
prior1H High : $${priorH1.high.toFixed(2)} / Low: $${priorH1.low.toFixed(2)}   — 5m BnH bull=${bh.h1Bull ? "✓" : "✗"} bear=${bh.h1Bear ? "✓" : "✗"}
5m BnH direction detected : ${bhDetectedDir.toUpperCase()} (bull=${bullishBHCount}/3 TFs, bear=${bearishBHCount}/3 TFs)
Break-and-hold confirmed  : ${breakAndHoldConfirmed ? `YES ✓ — ${assetFTFC} direction confirmed` : `NO ✗ — ${bhDetectedDir} signal conflicts with FTFC ${assetFTFC}`}

=== GOLDBACH ANALYSIS ===
--- Main DR (PO3=${po3Main}, based on 20-day ADR=$${adr.toFixed(2)}) ---
Range   : $${drMain.low.toFixed(2)} → $${drMain.high.toFixed(2)}
Position: $${currentPrice.toFixed(2)} = ${pctInRange}% of range
GB Bias : ${gbBiasDaily.toUpperCase()} (${parseFloat(pctInRange) < 47 ? "discount zone" : parseFloat(pctInRange) > 53 ? "premium zone" : "equilibrium"})

--- 4H DR (PO3=${po3H4}, avg 4H range=$${avgH4Range.toFixed(2)}) ---
Range   : $${drH4.low.toFixed(2)} → $${drH4.high.toFixed(2)}
GB Bias : ${gbBiasH4.toUpperCase()}

--- 1H DR (PO3=${po3H1}, avg 1H range=$${avgH1Range.toFixed(2)}) ---
Range   : $${drH1.low.toFixed(2)} → $${drH1.high.toFixed(2)}
GB Bias : ${gbBiasH1.toUpperCase()}

Goldbach agreement with FTFC: ${gbAgreement}/3 TFs
Nearest GB level (main DR): ${nearestGB.name} ($${nearestGB.level.toFixed(2)}, ${nearestGB.distPct.toFixed(2)}% away)
AT Goldbach level: ${atGBLevel ? "YES ✓" : "NO — not at a key level yet"}
${gbTpLevel ? `GB TP target: ${Object.entries(gbMain).find(([, v]) => v === gbTpLevel)?.[0] ?? ""} = $${gbTpLevel.toFixed(2)} (${gbTpDistPct?.toFixed(2)}% away)` : ""}

Main DR Goldbach levels:
${gbLevelsList}

=== AMD + STOP RUN ===
Session phase    : ${amdPhase.toUpperCase()}${inManipulation ? " ✓ ideal entry window" : ""}
Stop run (5m)    : ${stopRun.detected ? `YES — ${stopRun.direction} (swept $${stopRun.sweptLevel?.toFixed(2)})` : "NO"}

=== LAST 5×5-MIN ===
${last5min}

=== RISK RULES ===
SL fixed 30% margin = ±${((0.30 / leverage) * 100).toFixed(2)}% price at ${leverage}x.
TP: use GB TP target when at a GB level. Otherwise use distance to next TheStrat level.
Highest confidence: FTFC ✓ + intraday TFs agree + GB bias agrees + at GB level + stop run + London session.
`.trim();

    // ── Rule-based fallback (no Claude key) ──────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      const direction = assetFTFC === "bullish" ? "long" : "short";
      let confidence = 55;
      confidence += intradayAgreement * 10;       // up to +20 for 1H/4H
      confidence += gbAgreement * 5;              // up to +15 for GB TF bias
      if (btcAgreesWithAsset) confidence += 10;
      if (btcConflicts) confidence -= 10;
      if (atGBLevel) confidence += 15;
      if (stopRun.detected && stopRun.direction === (assetFTFC === "bullish" ? "bullish" : "bearish")) confidence += 10;
      if (inManipulation) confidence += 5;

      let tpPct: number;
      if (gbTpLevel && gbTpDistPct !== null) {
        tpPct = Math.round(Math.min(100, Math.max(25, gbTpDistPct * leverage)));
      } else if (distToNextKeyLevelPct > 5) tpPct = 80;
      else if (distToNextKeyLevelPct < 2) tpPct = 30;
      else tpPct = 50;

      if (h4Dir === "neutral" && h1Dir === "neutral") tpPct = Math.round(tpPct * 0.7);

      const slPricePct = 0.30 / leverage;
      const tpPricePct = tpPct / 100 / leverage;
      const isSwing = (dailyBarType === "2U" || dailyBarType === "2D") && intradayAgreement === 2 && btcAgreesWithAsset;

      return NextResponse.json({
        shouldTrade: true, direction, leverage,
        confidence: Math.min(100, Math.max(0, confidence)),
        tpPct, slPct: 30, isSwing,
        entry: currentPrice,
        sl: direction === "long" ? currentPrice * (1 - slPricePct) : currentPrice * (1 + slPricePct),
        tp: direction === "long" ? currentPrice * (1 + tpPricePct) : currentPrice * (1 - tpPricePct),
        reasoning: `Rule-based: FTFC ${assetFTFC}, intraday ${intradayAgreement}/3, GB ${gbAgreement}/3, BTC ${btcFTFC}.${atGBLevel ? ` At ${nearestGB.name}.` : ""}${stopRun.detected ? " Stop run." : ""}${inManipulation ? " London." : ""}`,
        trailTriggerPct: 20, trailRetreatPct: 35,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir,
        dailyBarType, h4BarType, h1BarType, btcFTFC,
        priorDayHigh: priorDay.high, priorDayLow: priorDay.low,
        priorH4High: priorH4.high, priorH4Low: priorH4.low,
        priorH1High: priorH1.high, priorH1Low: priorH1.low,
        priorWeekHigh, priorWeekLow, intradayAgreement, gbAgreement,
        goldbachLevel: nearestGB.name, goldbachLevelPrice: nearestGB.level,
        atGoldbachLevel: atGBLevel, goldbachTp: gbTpLevel, gbBiasDaily, gbBiasH4, gbBiasH1,
        po3Main, amdPhase, stopRunDetected: stopRun.detected,
      });
    }

    // ── Claude path ───────────────────────────────────────────────────────
    const prompt = `You are an expert crypto trader using TheStrat (Rob Smith) + Goldbach methodology.
All pre-conditions passed: FTFC=${assetFTFC}, break-and-hold confirmed.

${contextBlock}

DECISION RULES:
TheStrat direction: FTFC (weekly+daily) is the master bias. Intraday TFs (1H/4H) add conviction.
Goldbach entries: enter at GB levels (OB=11/89%, FVG=17/83%, Breaker=41/59%, Equil=47/53%).
Goldbach direction: when multiple TF GB biases (discount/premium) agree with FTFC, higher confidence.
GB TP: OB→Breaker, FVG→Breaker, Breaker→OB, Equil→opposite Equil, LV→Equil.
Best setup: FTFC ✓ + 2-3 intraday TFs agree + 2-3 GB TF biases agree + AT GB level + stop run + London session.
Weaker setup: FTFC ✓ but intraday mixed + not at GB level → lower confidence or no trade.

Decide:
1. shouldTrade: true/false
2. direction: "long" or "short" (follow FTFC)
3. confidence: 0-100. Score: +7 per intraday TF agreement (max +21), +5 per GB TF bias agreement (max +15), +15 if at GB level, +10 stop run, +10 BTC agrees, +10 London session
4. tpPct: 25-100 (% margin). Use GB TP distance × leverage if at a GB level. Otherwise TheStrat key level distance × leverage.
5. isSwing: true if daily 2U/2D + all 3 intraday TFs agree + BTC agrees + at OB/FVG level
6. trailTriggerPct: 15-40
7. trailRetreatPct: 20-45
8. reasoning: one sentence covering FTFC, which GB level, which TFs agreed

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
        reason: ai.reasoning ?? "Claude declined",
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir,
        dailyBarType, h4BarType, h1BarType, btcFTFC,
        goldbachLevel: nearestGB.name, gbBiasDaily, gbBiasH4, gbBiasH1, amdPhase,
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
      ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir,
      dailyBarType, h4BarType, h1BarType,
      btcFTFC, btcAgreesWithAsset, btcConflicts,
      priorDayHigh: priorDay.high, priorDayLow: priorDay.low,
      priorH4High: priorH4.high, priorH4Low: priorH4.low,
      priorH1High: priorH1.high, priorH1Low: priorH1.low,
      priorWeekHigh, priorWeekLow, distToNextKeyLevelPct,
      intradayAgreement, gbAgreement, gbBiasDaily, gbBiasH4, gbBiasH1,
      goldbachLevel: nearestGB.name, goldbachLevelPrice: nearestGB.level,
      atGoldbachLevel: atGBLevel, goldbachTp: gbTpLevel,
      po3Main, dealingRangeLow: drMain.low, dealingRangeHigh: drMain.high,
      amdPhase, stopRunDetected: stopRun.detected,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("autotrade error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
