import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Candle } from "@/types";
import { ASSETS } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

// Assets that don't track BTC closely right now — skip the BTC market filter
const BTC_UNCORRELATED = new Set(["HYPE", "ONDO", "PENDLE"]);

type BarType = "1" | "2U" | "2D" | "3";
type TFDirection = "bullish" | "bearish" | "neutral";
type FTFCResult = "bullish" | "bearish" | "mixed";

// ─── Candle fetching ──────────────────────────────────────────────────────────

async function fetchCandles(coin: string, interval: string, limit: number, dex: "" | "xyz" = ""): Promise<Candle[]> {
  const endTime = Date.now();
  const msPerBar = INTERVAL_MS[interval] ?? 3_600_000;
  const startTime = endTime - msPerBar * (limit + 2);

  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime, endTime, ...(dex ? { dex } : {}) } }),
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

// A candle's full BODY (both open and close) sits beyond the level
function bodyBeyond(c: Candle, level: number, direction: "bullish" | "bearish"): boolean {
  const bodyLow = Math.min(c.open, c.close);
  const bodyHigh = Math.max(c.open, c.close);
  return direction === "bullish" ? bodyLow > level : bodyHigh < level;
}

// Confirm a break of `level` in `direction`:
//   • a 5m candle must close fully bodied beyond the level AND price must still hold beyond
//   • a single fresh 5m body is treated as "needs 15m" — we wait for either a 2nd
//     bodied 5m candle OR a 15m candle to close fully bodied beyond before confirming
function confirmBreak(
  candles5m: Candle[],
  candles15m: Candle[],
  level: number,
  direction: "bullish" | "bearish"
): { confirmed: boolean; needs15m: boolean; via: string } {
  if (candles5m.length < 2 || level <= 0) return { confirmed: false, needs15m: false, via: "" };
  const last5 = candles5m[candles5m.length - 1];
  const held = direction === "bullish" ? last5.close > level : last5.close < level;
  if (!held) return { confirmed: false, needs15m: false, via: "" };

  const bodied5 = candles5m.slice(-6).filter((c) => bodyBeyond(c, level, direction)).length;
  const last15 = candles15m[candles15m.length - 1];
  const held15 = last15 ? (direction === "bullish" ? last15.close > level : last15.close < level) : false;
  const bodied15 = held15 && candles15m.slice(-3).some((c) => bodyBeyond(c, level, direction));

  // Strong: a 15m candle confirms, or two+ fully-bodied 5m candles held beyond the level
  if (bodied15) return { confirmed: true, needs15m: false, via: "15m" };
  if (bodied5 >= 2) return { confirmed: true, needs15m: false, via: `5m×${bodied5}` };
  // Marginal single fresh 5m body — wait for the 15m confirmation
  if (bodied5 === 1) return { confirmed: false, needs15m: true, via: "" };
  return { confirmed: false, needs15m: false, via: "" };
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

    // Resolve the HL coin name + dex for this ticker (stocks live on the xyz dex)
    const cfg = ASSETS[asset];
    const coin = cfg?.hlCoin ?? asset;
    const dex: "" | "xyz" = cfg?.dex ?? "";

    // Fetch all timeframes in parallel
    const [
      weeklyCandles, dailyCandles,
      h4Candles, h1Candles,
      candles15m, candles5m,
      btcDailyCandles, btcH4Candles,
    ] = await Promise.all([
      fetchCandles(coin, "1d", 21, dex),   // weekly proxy via daily
      fetchCandles(coin, "1d", 5, dex),
      fetchCandles(coin, "4h", 10, dex),
      fetchCandles(coin, "1h", 24, dex),   // 1H — last 24 hours
      fetchCandles(coin, "15m", 20, dex),  // 15m — for break confirmation
      fetchCandles(coin, "5m", 30, dex),
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

    const btcFTFC = calcFTFC(btcDailyDir, btcH4Dir);
    // Agreement metrics are computed against the BREAK direction (tradeDir) below.

    // ── Prior highs/lows across all timeframes ────────────────────────────
    const priorDay  = priorHL(dailyCandles);
    const priorH4   = priorHL(h4Candles);
    const priorH1   = priorHL(h1Candles);

    const priorWeekSlice = weeklyCandles.slice(0, 7);
    const priorWeekHigh = priorWeekSlice.length > 0 ? Math.max(...priorWeekSlice.map(c => c.high)) : priorDay.high * 1.05;
    const priorWeekLow  = priorWeekSlice.length > 0 ? Math.min(...priorWeekSlice.map(c => c.low))  : priorDay.low  * 0.95;

    // Break confirmation checked in BOTH directions on each timeframe.
    // Confirmation requires a fully-bodied 5m close beyond the prior level that holds;
    // a single fresh 5m body waits for a 15m candle (or a 2nd 5m body) to confirm.
    const noConfirm = { confirmed: false, needs15m: false, via: "" };
    const cDailyBull = confirmBreak(candles5m, candles15m, priorDay.high, "bullish");
    const cDailyBear = confirmBreak(candles5m, candles15m, priorDay.low,  "bearish");
    const cH4Bull    = confirmBreak(candles5m, candles15m, priorH4.high,  "bullish");
    const cH4Bear    = confirmBreak(candles5m, candles15m, priorH4.low,   "bearish");
    const cH1Bull    = h1Candles.length >= 2 ? confirmBreak(candles5m, candles15m, priorH1.high, "bullish") : noConfirm;
    const cH1Bear    = h1Candles.length >= 2 ? confirmBreak(candles5m, candles15m, priorH1.low,  "bearish") : noConfirm;

    const bh = {
      dailyBull: cDailyBull.confirmed, dailyBear: cDailyBear.confirmed,
      h4Bull:    cH4Bull.confirmed,    h4Bear:    cH4Bear.confirmed,
      h1Bull:    cH1Bull.confirmed,    h1Bear:    cH1Bear.confirmed,
    };

    // A break that is forming but still waiting on a 15m confirmation
    const pendingBull = [cDailyBull, cH4Bull, cH1Bull].some((c) => c.needs15m);
    const pendingBear = [cDailyBear, cH4Bear, cH1Bear].some((c) => c.needs15m);
    // Whether the confirmed break was validated by a 15m candle (stronger signal)
    const confirmedVia15m = [cDailyBull, cDailyBear, cH4Bull, cH4Bear, cH1Bull, cH1Bear]
      .some((c) => c.confirmed && c.via === "15m");

    const bullishBHCount = [bh.dailyBull, bh.h4Bull, bh.h1Bull].filter(Boolean).length;
    const bearishBHCount = [bh.dailyBear, bh.h4Bear, bh.h1Bear].filter(Boolean).length;

    // Which direction the 5m is actually confirming right now
    const bhDetectedDir = bullishBHCount > bearishBHCount ? "bullish"
      : bearishBHCount > bullishBHCount ? "bearish"
      : "mixed";

    // ── Direction FOLLOWS the actual break of prior structure ──
    // Bullish break = price took out a prior high (1H/4H/daily) and a fully-bodied
    // 5m (or 15m) candle is holding above. Bearish = mirror below a prior low.
    // 1H / 4H / daily breaks all count any time of day.
    const bullBreak = bh.dailyBull || bh.h4Bull || bh.h1Bull;
    const bearBreak = bh.dailyBear || bh.h4Bear || bh.h1Bear;

    // Require a CLEAN one-sided break; choppy two-sided = no trade
    let breakDir: "bullish" | "bearish" | "none" = "none";
    if (bullBreak && !bearBreak) breakDir = "bullish";
    else if (bearBreak && !bullBreak) breakDir = "bearish";

    // Trade direction FOLLOWS the break. FTFC is no longer a gate — it's folded
    // into the confidence score below (agree = boost, conflict = penalty).
    const breakAndHoldConfirmed = breakDir !== "none";
    const tradeDir: "bullish" | "bearish" = breakDir === "bearish" ? "bearish" : "bullish";
    const whichBreak = bh.dailyBull || bh.dailyBear ? "daily"
      : bh.h4Bull || bh.h4Bear ? "4H"
      : bh.h1Bull || bh.h1Bear ? "1H" : "none";

    // ── Agreement metrics, all relative to the BREAK direction (tradeDir) ──
    const ftfcAgrees = assetFTFC === tradeDir;
    const ftfcConflicts = (assetFTFC === "bullish" && tradeDir === "bearish") || (assetFTFC === "bearish" && tradeDir === "bullish");
    const intradayAgreement = [h1Dir, h4Dir].filter((d) => d === tradeDir).length;
    const btcExcluded = BTC_UNCORRELATED.has(asset);
    const btcAgreesWithAsset = !btcExcluded && btcFTFC === tradeDir;
    const btcConflicts = !btcExcluded && ((btcFTFC === "bullish" && tradeDir === "bearish") || (btcFTFC === "bearish" && tradeDir === "bullish"));

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

    // Count how many TF GB biases agree with the break direction
    const gbBiases = [gbBiasDaily, gbBiasH4, gbBiasH1];
    const gbAgreement = gbBiases.filter((b) => b === tradeDir).length;

    // ── AMD + stop run ────────────────────────────────────────────────────
    const stopRun = detectStopRun(candles5m);
    const amdPhase = getAMDPhase(new Date().getUTCHours());
    const inManipulation = amdPhase === "manipulation";

    // ── Confidence score breakdown (rule-based factors, shown in the bot panel) ──
    const buildBreakdown = () => {
      const b: Array<{ label: string; points: number; active: boolean }> = [
        { label: "Base", points: 45, active: true },
      ];
      if (ftfcAgrees) b.push({ label: "FTFC agrees with break", points: 20, active: true });
      else if (ftfcConflicts) b.push({ label: "FTFC conflicts", points: -15, active: true });
      else b.push({ label: "FTFC mixed", points: 0, active: false });
      b.push({ label: `Intraday 1H/4H aligned (${intradayAgreement}/2)`, points: intradayAgreement * 8, active: intradayAgreement > 0 });
      b.push({ label: `Goldbach bias aligned (${gbAgreement}/3)`, points: gbAgreement * 5, active: gbAgreement > 0 });
      if (btcExcluded) b.push({ label: "BTC filter n/a (uncorrelated)", points: 0, active: false });
      else if (btcAgreesWithAsset) b.push({ label: "BTC agrees", points: 10, active: true });
      else if (btcConflicts) b.push({ label: "BTC conflicts", points: -10, active: true });
      else b.push({ label: "BTC neutral", points: 0, active: false });
      b.push({ label: "At Goldbach level", points: 15, active: atGBLevel });
      b.push({ label: "Stop run in trade direction", points: 10, active: stopRun.detected && stopRun.direction === tradeDir });
      b.push({ label: "15m confirmation", points: 5, active: confirmedVia15m });
      b.push({ label: "London session", points: 5, active: inManipulation });
      return b;
    };
    const confidenceBreakdown = buildBreakdown();

    // FTFC is no longer a gate (folded into confidence). A clean break is all
    // that's required to consider a trade.
    if (!breakAndHoldConfirmed) {
      const reason = (pendingBull || pendingBear)
        ? `Break forming — waiting on 15m confirmation (bull=${pendingBull}, bear=${pendingBear})`
        : `No clean structural break (bull=${bullBreak}, bear=${bearBreak})`;
      return NextResponse.json({
        shouldTrade: false,
        reason,
        ftfc: assetFTFC, weeklyDir, dailyDir, h4Dir, h1Dir, breakDir, whichBreak,
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
Intraday TFs aligned with ${tradeDir} break: ${intradayAgreement}/2

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

Goldbach TF biases aligned with ${tradeDir} break: ${gbAgreement}/3
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
Confidence drivers: FTFC agrees with break (+20) / conflicts (-15); intraday + GB aligned; at GB level; stop run; BTC agrees (n/a for HYPE/ONDO/PENDLE); 15m confirmation; London session.
`.trim();

    // ── Rule-based fallback (no Claude key) ──────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      const direction = tradeDir === "bullish" ? "long" : "short"; // follow the break
      let confidence = 45;
      // FTFC folded into confidence: agree = strong boost, conflict = penalty
      if (ftfcAgrees) confidence += 20;
      else if (ftfcConflicts) confidence -= 15;
      confidence += intradayAgreement * 8;        // up to +16 for 1H/4H aligned to break
      confidence += gbAgreement * 5;              // up to +15 for GB TF bias
      if (btcAgreesWithAsset) confidence += 10;
      if (btcConflicts) confidence -= 10;
      if (atGBLevel) confidence += 15;
      if (stopRun.detected && stopRun.direction === tradeDir) confidence += 10;
      if (confirmedVia15m) confidence += 5;
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
        confidenceBreakdown,
      });
    }

    // ── Claude path ───────────────────────────────────────────────────────
    const tradeSide = tradeDir === "bullish" ? "long" : "short";
    const prompt = `You are an expert crypto trader using TheStrat (Rob Smith) + Goldbach methodology.
Pre-conditions passed: FTFC=${assetFTFC}; a ${tradeDir} break of the prior ${whichBreak} ${tradeDir === "bullish" ? "high" : "low"} is confirmed and holding on the 5m.
The trade DIRECTION is therefore ${tradeSide.toUpperCase()} — do not flip it. Your job is to judge quality and parameters.

${contextBlock}

DECISION RULES:
The direction is fixed to the confirmed break (${tradeSide}). Never return the opposite side.
Goldbach entries: enter at GB levels (OB=11/89%, FVG=17/83%, Breaker=41/59%, Equil=47/53%).
GB TP: OB→Breaker, FVG→Breaker, Breaker→OB, Equil→opposite Equil, LV→Equil.
Best setup: break + intraday TFs agree + GB bias agrees + at GB level + stop run + London session.
If the setup looks weak (no GB level, no stop run, conflicting BTC), return shouldTrade=false.

Decide:
1. shouldTrade: true/false
2. direction: "${tradeSide}" (fixed — must match the break)
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

    // Force direction to the confirmed break — never let the model trade against it
    const direction: "long" | "short" = tradeDir === "bullish" ? "long" : "short";
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
      confidenceBreakdown,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("autotrade error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
