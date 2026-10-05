import { NextRequest, NextResponse } from "next/server";
import type { Candle } from "@/types";
import { ASSETS } from "@/types";

// ════════════════════════════════════════════════════════════════════════════
//  PURE THESTRAT ENGINE (Rob Smith)
//  Implements the 3 Universal Truths — nothing else. No AI, no RSI, no volume,
//  no funding/OI, no Goldbach, no learning.
//
//  Truth 1 — Price can only trade 3 ways vs the prior bar: 1 (inside),
//            2U/2D (directional, one side), 3 (outside, both sides).
//  Truth 2 — Direction = Full Timeframe Continuity (FTFC): trade in the
//            direction in which the most timeframes agree (price vs each TF open).
//  Truth 3 — Price discovers via a broadening formation: take reversals /
//            continuations back through a PRIOR RANGE, in the direction of FTFC;
//            the target is the next prior high/low (the next range to trade to).
// ════════════════════════════════════════════════════════════════════════════

const HL_INFO = "https://api.hyperliquid.xyz/info";

const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000,
  "1d": 86_400_000, "1w": 604_800_000, "1M": 2_592_000_000,
};

type BarType = "1" | "2U" | "2D" | "3";
type Dir = "bullish" | "bearish" | "neutral";

// ─── Candle fetching (dex-aware, cached, retry on 429) ──────────────────────
const CANDLE_TTL_MS = 60_000;
const candleCache = new Map<string, { ts: number; candles: Candle[] }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchCandles(coin: string, interval: string, limit: number, dex: string = ""): Promise<Candle[]> {
  const cacheKey = `${dex}:${coin}:${interval}:${limit}`;
  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CANDLE_TTL_MS) return cached.candles;

  const endTime = Date.now();
  const msPerBar = INTERVAL_MS[interval] ?? 3_600_000;
  const startTime = endTime - msPerBar * (limit + 2);
  const body = JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime, endTime, ...(dex ? { dex } : {}) } });

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(HL_INFO, { method: "POST", headers: { "Content-Type": "application/json" }, body, next: { revalidate: 0 } });
    if (res.ok) {
      const data: Array<{ t: number; o: string; h: string; l: string; c: string; v: string }> = await res.json();
      const candles = data.map((c) => ({
        time: c.t / 1000, open: parseFloat(c.o), high: parseFloat(c.h),
        low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v),
      }));
      candleCache.set(cacheKey, { ts: Date.now(), candles });
      return candles;
    }
    lastErr = String(res.status);
    if (res.status === 429) await sleep(400 * (attempt + 1)); else break;
  }
  if (cached) return cached.candles;
  throw new Error(`Candle fetch failed for ${coin} ${interval} (${lastErr})`);
}

// ─── Truth 1: bar-type classification vs the prior bar ──────────────────────
function classifyBar(curr: Candle, prev: Candle): BarType {
  const tookHigh = curr.high > prev.high;
  const tookLow = curr.low < prev.low;
  if (tookHigh && tookLow) return "3";
  if (tookHigh) return "2U";
  if (tookLow) return "2D";
  return "1";
}

// Directional reading of a timeframe's most recent closed structure
function barDir(bt: BarType, curr: Candle): Dir {
  if (bt === "2U") return "bullish";
  if (bt === "2D") return "bearish";
  if (bt === "3") return curr.close > (curr.high + curr.low) / 2 ? "bullish" : "bearish";
  return "neutral"; // inside bar — no bias
}

// ─── Truth 2: continuity — current price vs each timeframe's OPEN ────────────
// (Rob Smith's FTFC: for a long, price must be above the open on every TF.)
function continuity(price: number, openPx: number): Dir {
  if (price > openPx) return "bullish";
  if (price < openPx) return "bearish";
  return "neutral";
}

const lastOpen = (candles: Candle[]) => candles.length ? candles[candles.length - 1].open : 0;
const priorBar = (candles: Candle[]) => candles.length >= 2 ? candles[candles.length - 2] : null;
const currBar = (candles: Candle[]) => candles.length ? candles[candles.length - 1] : null;

// ─── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { asset, leverage = 3, minConfidence = 55 } = await req.json();
    const cfg = ASSETS[asset];
    const coin = cfg?.hlCoin ?? asset;
    const dex: string = cfg?.dex ?? "";

    // Fetch all Strat timeframes (real monthly/weekly bars) + 5m trigger confirm
    const [monthly, weekly, daily, h4, h1, c5m] = await Promise.all([
      fetchCandles(coin, "1M", 6, dex),
      fetchCandles(coin, "1w", 8, dex),
      fetchCandles(coin, "1d", 10, dex),
      fetchCandles(coin, "4h", 12, dex),
      fetchCandles(coin, "1h", 24, dex),
      fetchCandles(coin, "5m", 12, dex),
    ]);

    if (daily.length < 2 || h4.length < 2 || h1.length < 2 || c5m.length < 2) {
      return NextResponse.json({ shouldTrade: false, reason: "Insufficient candle data" });
    }

    const price = c5m[c5m.length - 1].close;

    // ── Truth 1: bar types per timeframe ──────────────────────────────────
    const bt = (cs: Candle[]): BarType => cs.length >= 2 ? classifyBar(cs[cs.length - 1], cs[cs.length - 2]) : "1";
    const monthlyBar = bt(monthly), weeklyBar = bt(weekly), dailyBar = bt(daily), h4Bar = bt(h4), h1Bar = bt(h1);
    const monthlyDir = currBar(monthly) ? barDir(monthlyBar, currBar(monthly)!) : "neutral";
    const weeklyDir = currBar(weekly) ? barDir(weeklyBar, currBar(weekly)!) : "neutral";
    const dailyDir = currBar(daily) ? barDir(dailyBar, currBar(daily)!) : "neutral";
    const h4Dir = currBar(h4) ? barDir(h4Bar, currBar(h4)!) : "neutral";
    const h1Dir = currBar(h1) ? barDir(h1Bar, currBar(h1)!) : "neutral";

    // ── Truth 2: Full Timeframe Continuity (price vs each TF open) ─────────
    const contTFs = [
      { tf: "M", dir: continuity(price, lastOpen(monthly)) },
      { tf: "W", dir: continuity(price, lastOpen(weekly)) },
      { tf: "D", dir: continuity(price, lastOpen(daily)) },
      { tf: "4H", dir: continuity(price, lastOpen(h4)) },
      { tf: "1H", dir: continuity(price, lastOpen(h1)) },
    ];
    const bullCont = contTFs.filter((t) => t.dir === "bullish").length;
    const bearCont = contTFs.filter((t) => t.dir === "bearish").length;
    const total = contTFs.length;

    // FTFC bias: a clear majority AND higher TFs (weekly+daily) must agree.
    const wDailyBull = contTFs[1].dir === "bullish" && contTFs[2].dir === "bullish";
    const wDailyBear = contTFs[1].dir === "bearish" && contTFs[2].dir === "bearish";
    let ftfc: Dir = "neutral";
    if (bullCont >= 3 && wDailyBull) ftfc = "bullish";
    else if (bearCont >= 3 && wDailyBear) ftfc = "bearish";

    const alignedCount = ftfc === "bullish" ? bullCont : ftfc === "bearish" ? bearCont : 0;
    const fullFTFC = alignedCount === total;

    // ── Prior-bar ranges (the ranges we trade back through / toward) ───────
    const pDay = priorBar(daily), pH4 = priorBar(h4), pH1 = priorBar(h1);
    const pWeek = priorBar(weekly), pMonth = priorBar(monthly);
    const priorDayHigh = pDay?.high ?? 0, priorDayLow = pDay?.low ?? 0;
    const priorH4High = pH4?.high ?? 0, priorH4Low = pH4?.low ?? 0;
    const priorH1High = pH1?.high ?? 0, priorH1Low = pH1?.low ?? 0;
    const priorWeekHigh = pWeek?.high ?? 0, priorWeekLow = pWeek?.low ?? 0;
    const priorMonthHigh = pMonth?.high ?? 0, priorMonthLow = pMonth?.low ?? 0;

    // ── Truth 3: actionable trigger — a directional 2 (or 3) on a trigger TF
    //    that trades back through the PRIOR bar's range in the FTFC direction,
    //    confirmed by a 5m close that holds beyond the broken level. ─────────
    const held5mAbove = (lvl: number) => c5m[c5m.length - 1].close > lvl && c5m.slice(-3).some((c) => c.close > lvl);
    const held5mBelow = (lvl: number) => c5m[c5m.length - 1].close < lvl && c5m.slice(-3).some((c) => c.close < lvl);

    // Evaluate triggers from highest TF to lowest (higher TF = higher quality).
    // A long trigger: current TF bar took out the prior bar HIGH (2U/3) and a 5m
    // close is holding above it. Short: took out prior LOW and 5m holds below.
    type Trig = { tf: "daily" | "4H" | "1H"; dir: "bullish" | "bearish"; brokeLevel: number; triggerBar: Candle; priorBarRef: Candle; reversal: boolean };
    const triggers: Trig[] = [];
    const evalTF = (tf: "daily" | "4H" | "1H", cs: Candle[]) => {
      const cur = currBar(cs), pr = priorBar(cs);
      if (!cur || !pr) return;
      const thisBar = classifyBar(cur, pr);
      const prevBar = cs.length >= 3 ? classifyBar(pr, cs[cs.length - 3]) : "1";
      // Long: this bar is 2U/3 (took prior high) and 5m holds above prior high
      if ((thisBar === "2U" || thisBar === "3") && held5mAbove(pr.high)) {
        triggers.push({ tf, dir: "bullish", brokeLevel: pr.high, triggerBar: cur, priorBarRef: pr, reversal: prevBar === "2D" });
      }
      // Short: this bar is 2D/3 (took prior low) and 5m holds below prior low
      if ((thisBar === "2D" || thisBar === "3") && held5mBelow(pr.low)) {
        triggers.push({ tf, dir: "bearish", brokeLevel: pr.low, triggerBar: cur, priorBarRef: pr, reversal: prevBar === "2U" });
      }
    };
    evalTF("daily", daily);
    evalTF("4H", h4);
    evalTF("1H", h1);

    // Keep only triggers in the FTFC direction (Truth 2: trade with continuity)
    const validTriggers = triggers.filter((t) => t.dir === ftfc);
    const trigger = validTriggers[0]; // highest-TF trigger that aligns with FTFC

    // ── Diagnostics shared by every response ──────────────────────────────
    const diag = {
      ftfc, monthlyDir, weeklyDir, dailyDir, h4Dir, h1Dir,
      monthlyBar, weeklyBar, dailyBar, h4Bar, h1Bar,
      continuity: { bull: bullCont, bear: bearCont, total, aligned: alignedCount, full: fullFTFC },
      priorDayHigh, priorDayLow, priorH4High, priorH4Low, priorH1High, priorH1Low,
      priorWeekHigh, priorWeekLow,
    };

    // Build the Strat-only confidence breakdown (shown in the bot panel)
    const breakdown = (dir: Dir, trig?: Trig) => {
      const b: Array<{ label: string; points: number; active: boolean }> = [];
      b.push({ label: "Base", points: 30, active: true });
      b.push({ label: `FTFC continuity ${alignedCount}/${total}`, points: alignedCount * 8, active: alignedCount > 0 });
      b.push({ label: "Full timeframe continuity", points: 10, active: fullFTFC });
      b.push({ label: "Monthly aligned", points: 5, active: (dir === monthlyDir) });
      if (trig) {
        const tfPts = trig.tf === "daily" ? 15 : trig.tf === "4H" ? 10 : 5;
        b.push({ label: `${trig.tf} trigger (break of prior range)`, points: tfPts, active: true });
        b.push({ label: "2-2 reversal", points: 10, active: trig.reversal });
      } else {
        b.push({ label: "Trigger (break of prior range)", points: 0, active: false });
      }
      return b;
    };

    // ── No bias or no trigger → report the live Strat state, no trade ──────
    if (ftfc === "neutral" || !trigger) {
      const dirForView: Dir = ftfc !== "neutral" ? ftfc : (bullCont > bearCont ? "bullish" : bearCont > bullCont ? "bearish" : "neutral");
      const bd = breakdown(dirForView, undefined);
      const conf = Math.max(0, Math.min(100, bd.reduce((s, f) => s + (f.active ? f.points : 0), 0)));
      const reason = ftfc === "neutral"
        ? `No FTFC bias — continuity split (bull ${bullCont}/${total}, bear ${bearCont}/${total}); weekly+daily must agree`
        : `FTFC ${ftfc} but no confirmed trigger yet (need a 2 breaking a prior ${ftfc === "bullish" ? "high" : "low"} with a 5m hold)`;
      return NextResponse.json({
        shouldTrade: false, reason, confidence: conf,
        direction: dirForView === "bearish" ? "short" : "long",
        confidenceBreakdown: bd, features: [`ftfc:${ftfc}:${alignedCount}/${total}`],
        breakDir: ftfc, whichBreak: "none", ...diag,
      });
    }

    // ── We have an FTFC-aligned trigger → build the trade ──────────────────
    const direction: "long" | "short" = trigger.dir === "bullish" ? "long" : "short";
    const whichBreak = trigger.tf;

    // Confidence (pure Strat factors)
    const bd = breakdown(ftfc, trigger);
    let confidence = Math.max(0, Math.min(100, bd.reduce((s, f) => s + (f.active ? f.points : 0), 0)));

    // ── Stop: tight, from lower-TF structure (Truth 3: structural invalidation)
    //    Long  → below the broken prior high OR the recent 5m swing low (tightest
    //            level still below price). Short → mirror above. +buffer.
    const SL_BUFFER = 0.0015;
    const recent5mLow = Math.min(...c5m.slice(-6).map((c) => c.low));
    const recent5mHigh = Math.max(...c5m.slice(-6).map((c) => c.high));
    let sl: number;
    if (direction === "long") {
      // candidates below price: the trigger bar low, the broken level, recent 5m swing low
      const cands = [trigger.triggerBar.low, trigger.brokeLevel, recent5mLow].filter((v) => v < price);
      const base = cands.length ? Math.max(...cands) : price * 0.995; // tightest below
      sl = base * (1 - SL_BUFFER);
    } else {
      const cands = [trigger.triggerBar.high, trigger.brokeLevel, recent5mHigh].filter((v) => v > price);
      const base = cands.length ? Math.min(...cands) : price * 1.005;
      sl = base * (1 + SL_BUFFER);
    }
    // Safety: stop must sit on the losing side of entry
    if (direction === "long" && sl >= price) sl = price * 0.995;
    if (direction === "short" && sl <= price) sl = price * 1.005;

    // ── Target: the next PRIOR high/low that offers real magnitude (Truth 3).
    //    Step up the timeframes and take the nearest prior level that is at least
    //    1.5× the stop distance away (so R:R ≥ 1.5). If every structural level is
    //    too close (price is already testing it), project a 2R broadening target.
    const stopDist = Math.abs(price - sl);
    const minTargetDist = stopDist * 1.5;
    let tp: number;
    if (direction === "long") {
      const ups = [priorH1High, priorH4High, priorDayHigh, priorWeekHigh, priorMonthHigh]
        .filter((v) => v > price).sort((a, b) => a - b);
      const good = ups.find((v) => v - price >= minTargetDist);
      tp = good ?? price + stopDist * 2;
    } else {
      const downs = [priorH1Low, priorH4Low, priorDayLow, priorWeekLow, priorMonthLow]
        .filter((v) => v > 0 && v < price).sort((a, b) => b - a);
      const good = downs.find((v) => price - v >= minTargetDist);
      tp = good ?? price - stopDist * 2;
    }

    // ── Leverage-aware risk: cap leverage so the structural stop risks ≤50% margin
    const stopDistPct = stopDist / price;
    const MAX_STOP_RISK = 0.5;
    const maxLev = stopDistPct > 0 ? Math.floor(MAX_STOP_RISK / stopDistPct) : leverage;
    const effLeverage = Math.max(1, Math.min(leverage, maxLev || 1));

    // Risk:reward — require ≥1.5:1 (broadening targets should give room)
    const rr = stopDist > 0 ? Math.abs(tp - price) / stopDist : 0;
    if (rr >= 2) confidence = Math.min(100, confidence + 5);

    // isSwing: higher-TF trigger (daily/4H) under full/near-full continuity
    const isSwing = (whichBreak === "daily" || whichBreak === "4H") && alignedCount >= 4;

    const slPct = Math.round(stopDistPct * 100 * effLeverage);
    const tpPct = Math.round((Math.abs(tp - price) / price) * 100 * effLeverage);

    const features = [
      `ftfc:${ftfc}:${alignedCount}/${total}`,
      `trigger:${whichBreak}`,
      ...(trigger.reversal ? ["reversal:2-2"] : ["continuation"]),
      ...(fullFTFC ? ["full-ftfc"] : []),
    ];

    const reasoning =
      `${direction.toUpperCase()} — FTFC ${ftfc} (${alignedCount}/${total} TFs), ` +
      `${whichBreak} ${trigger.reversal ? "2-2 reversal" : "2 continuation"} through prior ${direction === "long" ? "high" : "low"} ` +
      `$${trigger.brokeLevel.toFixed(2)} (5m hold). SL $${sl.toFixed(2)} (${(stopDistPct * 100).toFixed(2)}%), ` +
      `TP $${tp.toFixed(2)} (next prior ${direction === "long" ? "high" : "low"}), R:R ${rr.toFixed(2)}, ${effLeverage}x.`;

    // Quality gate: need a clear FTFC bias + confirmed trigger + decent R:R + min confidence.
    let shouldTrade = true;
    let reason: string | undefined;
    if (rr < 1.5) { shouldTrade = false; reason = `Risk:reward too low (${rr.toFixed(2)}:1, need ≥1.5)`; }
    else if (confidence < minConfidence) { shouldTrade = false; reason = `Below confidence bar ${minConfidence}% (${confidence}%)`; }

    return NextResponse.json({
      shouldTrade,
      reason,
      direction,
      leverage: effLeverage,
      confidence,
      confidenceBreakdown: bd,
      features,
      entry: price,
      sl,
      tp,
      slPct,
      tpPct,
      isSwing,
      trailTriggerPct: 20,
      trailRetreatPct: 35,
      reasoning,
      breakDir: ftfc,
      whichBreak,
      ...diag,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("autotrade (TheStrat) error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
