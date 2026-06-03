import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Candle } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

// Interval durations in ms — note: "1w" is proxied via "1d" with 14 candles
const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

// ─── Bar type and direction types ────────────────────────────────────────────
type BarType = "1" | "2U" | "2D" | "3";
type TFDirection = "bullish" | "bearish" | "neutral";
type FTFCResult = "bullish" | "bearish" | "mixed";

// ─── fetchCandles ─────────────────────────────────────────────────────────────
// Hyperliquid interval strings: "1m", "5m", "15m", "1h", "4h", "1d"
// Weekly is proxied as "1d" with a larger limit (the caller uses 14 candles)
async function fetchCandles(
  coin: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const endTime = Date.now();
  const msPerBar = INTERVAL_MS[interval] ?? 3_600_000;
  // Add a small buffer so we always get the full `limit` of closed candles
  const startTime = endTime - msPerBar * (limit + 2);

  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    }),
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Candle fetch failed for ${coin} ${interval}`);

  const data: Array<{
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
  }> = await res.json();

  return data.map((c) => ({
    time: c.t / 1000,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));
}

// ─── classifyBar ─────────────────────────────────────────────────────────────
// Compares `curr` against `prev` and returns the TheStrat bar type
function classifyBar(curr: Candle, prev: Candle): BarType {
  const tookOutHigh = curr.high > prev.high;
  const tookOutLow = curr.low < prev.low;

  if (tookOutHigh && tookOutLow) return "3"; // Outside bar
  if (tookOutHigh && !tookOutLow) return "2U"; // Directional up
  if (!tookOutHigh && tookOutLow) return "2D"; // Directional down
  return "1"; // Inside bar (neither high nor low taken out)
}

// ─── getTFDirection ───────────────────────────────────────────────────────────
// Takes an array of candles (at least 2) and returns the directional bias of
// the LAST candle relative to the second-to-last.
function getTFDirection(candles: Candle[]): TFDirection {
  if (candles.length < 2) return "neutral";
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const barType = classifyBar(curr, prev);

  if (barType === "2U") return "bullish";
  if (barType === "2D") return "bearish";
  if (barType === "3") {
    // Directional close relative to bar midpoint
    const mid = (curr.high + curr.low) / 2;
    return curr.close > mid ? "bullish" : "bearish";
  }
  // Inside bar → neutral
  return "neutral";
}

// ─── calcFTFC ─────────────────────────────────────────────────────────────────
// FTFC uses Weekly + Daily (and optionally 4H) candles.
// Green  = Weekly bullish AND Daily bullish
// Red    = Weekly bearish AND Daily bearish
// Mixed  = everything else
function calcFTFC(
  weeklyDir: TFDirection,
  dailyDir: TFDirection
): FTFCResult {
  if (weeklyDir === "bullish" && dailyDir === "bullish") return "bullish";
  if (weeklyDir === "bearish" && dailyDir === "bearish") return "bearish";
  return "mixed";
}

// ─── checkBreakAndHold ────────────────────────────────────────────────────────
// Returns true if at least one recent 5-min candle CLOSED above/below `level`
// AND the MOST RECENT close is still above/below (i.e. hasn't reversed).
function checkBreakAndHold(
  candles5m: Candle[],
  level: number,
  direction: "bullish" | "bearish"
): boolean {
  if (candles5m.length < 2) return false;

  const mostRecentClose = candles5m[candles5m.length - 1].close;

  if (direction === "bullish") {
    const brokeAbove = candles5m.some((c) => c.close > level);
    const stillHolding = mostRecentClose > level;
    return brokeAbove && stillHolding;
  } else {
    const brokeBelow = candles5m.some((c) => c.close < level);
    const stillHolding = mostRecentClose < level;
    return brokeBelow && stillHolding;
  }
}

// ─── Anthropic client ─────────────────────────────────────────────────────────
function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { asset, leverage = 3 } = await req.json();

    // ── 1. Fetch all required candle data in parallel ──────────────────────
    // Weekly proxy: "1d" with 14 candles (covers ~2 weeks so we have prev + curr week)
    const [
      weeklyCandles, // "1d" x14 — treat last 2 as curr/prev weekly proxy
      dailyCandles,
      h4Candles,
      candles5m,
      btcDailyCandles,
      btcH4Candles,
    ] = await Promise.all([
      fetchCandles(asset, "1d", 14),
      fetchCandles(asset, "1d", 5),
      fetchCandles(asset, "4h", 10),
      fetchCandles(asset, "5m", 30),
      fetchCandles("BTC", "1d", 5),
      fetchCandles("BTC", "4h", 10),
    ]);

    if (dailyCandles.length < 3 || h4Candles.length < 3 || candles5m.length < 5) {
      return NextResponse.json({
        shouldTrade: false,
        reason: "Insufficient candle data from exchange",
      });
    }

    // ── 2. Bar classification ──────────────────────────────────────────────
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

    // ── 3. FTFC ───────────────────────────────────────────────────────────
    const assetFTFC = calcFTFC(weeklyDir, dailyDir);

    // BTC market filter: compute BTC FTFC
    const btcFTFC = calcFTFC(btcDailyDir, btcH4Dir);
    const btcAgreesWithAsset =
      (btcFTFC === "bullish" && assetFTFC === "bullish") ||
      (btcFTFC === "bearish" && assetFTFC === "bearish");
    const btcConflicts =
      (btcFTFC === "bullish" && assetFTFC === "bearish") ||
      (btcFTFC === "bearish" && assetFTFC === "bullish");

    // ── 4. Key levels ─────────────────────────────────────────────────────
    // priorDay = second-to-last daily candle
    const priorDayCandle = dailyCandles[dailyCandles.length - 2];
    const priorDayHigh = priorDayCandle?.high ?? 0;
    const priorDayLow = priorDayCandle?.low ?? 0;

    // priorWeek = aggregate of the FIRST 7 daily candles in the 14-day window
    // (days 0-6 = prior week, days 7-13 = current week)
    const priorWeekSlice = weeklyCandles.slice(0, 7);
    const currWeekSlice  = weeklyCandles.slice(7);
    const priorWeekHigh =
      priorWeekSlice.length > 0
        ? Math.max(...priorWeekSlice.map((c) => c.high))
        : priorDayHigh * 1.05;
    const priorWeekLow =
      priorWeekSlice.length > 0
        ? Math.min(...priorWeekSlice.map((c) => c.low))
        : priorDayLow * 0.95;
    // currWeekSlice is available if needed for weeklyDir context (already computed above)

    // ── 5. 5-min break-and-hold ───────────────────────────────────────────
    const breakAndHoldBull = checkBreakAndHold(candles5m, priorDayHigh, "bullish");
    const breakAndHoldBear = checkBreakAndHold(candles5m, priorDayLow, "bearish");

    const currentPrice = candles5m[candles5m.length - 1].close;

    // ── 6. Early exits ────────────────────────────────────────────────────
    if (assetFTFC === "mixed") {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC mixed — weekly=${weeklyDir}, daily=${dailyDir}. No clear bias.`,
        ftfc: assetFTFC,
        weeklyDir,
        dailyDir,
        h4Dir,
        dailyBarType,
        h4BarType,
      });
    }

    const requiredBreakAndHold =
      assetFTFC === "bullish" ? breakAndHoldBull : breakAndHoldBear;

    if (!requiredBreakAndHold) {
      return NextResponse.json({
        shouldTrade: false,
        reason: `FTFC ${assetFTFC} but 5-min break-and-hold not confirmed on ${
          assetFTFC === "bullish" ? "priorDayHigh" : "priorDayLow"
        } ($${assetFTFC === "bullish" ? priorDayHigh.toFixed(4) : priorDayLow.toFixed(4)})`,
        ftfc: assetFTFC,
        priorDayHigh,
        priorDayLow,
        weeklyDir,
        dailyDir,
        h4Dir,
        dailyBarType,
        h4BarType,
      });
    }

    // ── 7. Distance to next key level (for TP sizing) ─────────────────────
    const distToNextKeyLevelPct =
      assetFTFC === "bullish"
        ? ((priorWeekHigh - currentPrice) / currentPrice) * 100
        : ((currentPrice - priorWeekLow) / currentPrice) * 100;

    // ── 8. Build context for Claude / fallback ────────────────────────────
    const last5min = candles5m.slice(-5).map((c) =>
      `  ${new Date(c.time * 1000).toISOString()} o:${c.open.toFixed(4)} h:${c.high.toFixed(4)} l:${c.low.toFixed(4)} c:${c.close.toFixed(4)}`
    ).join("\n");

    const contextBlock = `
ASSET: ${asset}/USDT  |  PRICE: $${currentPrice.toFixed(4)}  |  LEVERAGE: ${leverage}x

=== THESTRAT MULTI-TIMEFRAME ANALYSIS ===
Weekly  (proxy via daily) : ${weeklyDir}
Daily                     : ${dailyDir}  [bar type: ${dailyBarType}]
4H                        : ${h4Dir}    [bar type: ${h4BarType}]
FTFC (weekly+daily)       : ${assetFTFC.toUpperCase()}

=== BTC MARKET FILTER ===
BTC Daily                 : ${btcDailyDir}
BTC 4H                    : ${btcH4Dir}
BTC FTFC                  : ${btcFTFC.toUpperCase()}
BTC vs Asset              : ${btcAgreesWithAsset ? "AGREES (high confidence)" : btcConflicts ? "CONFLICTS (reduce confidence)" : "neutral"}

=== KEY LEVELS ===
priorDayHigh              : $${priorDayHigh.toFixed(4)}
priorDayLow               : $${priorDayLow.toFixed(4)}
priorWeekHigh             : $${priorWeekHigh.toFixed(4)}
priorWeekLow              : $${priorWeekLow.toFixed(4)}

=== 5-MIN CONFIRMATION ===
Break-and-hold ABOVE priorDayHigh: ${breakAndHoldBull}
Break-and-hold BELOW priorDayLow : ${breakAndHoldBear}

Last 5 × 5-min candles:
${last5min}

=== DISTANCE TO NEXT KEY LEVEL ===
${assetFTFC === "bullish" ? `Longs: priorWeekHigh ${distToNextKeyLevelPct.toFixed(2)}% away` : `Shorts: priorWeekLow ${distToNextKeyLevelPct.toFixed(2)}% away`}

=== RISK RULES ===
SL is FIXED at 30% of margin (price = ±${((0.30 / leverage) * 100).toFixed(2)}% from entry at ${leverage}x).
TP is dynamic (25-100% of margin). If next key level >5% away → TP 70-100%. If <2% away → TP 25-40%.
If 4H agrees with daily bias → higher confidence, larger TP.
If 4H is inside bar (type 1) but daily is aligned → enter but smaller size / lower tpPct.
`.trim();

    // ── 9. AI path ────────────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      // ── Rule-based fallback ──────────────────────────────────────────
      const direction = assetFTFC === "bullish" ? "long" : "short";

      // Confidence: base 60, +10 if 4H agrees, +10 if BTC agrees, -10 if BTC conflicts
      let confidence = 60;
      if (
        (assetFTFC === "bullish" && h4Dir === "bullish") ||
        (assetFTFC === "bearish" && h4Dir === "bearish")
      )
        confidence += 10;
      if (btcAgreesWithAsset) confidence += 10;
      if (btcConflicts) confidence -= 10;

      // TP sizing based on distance to next key level
      let tpPct: number;
      if (distToNextKeyLevelPct > 5) tpPct = 80;
      else if (distToNextKeyLevelPct < 2) tpPct = 30;
      else tpPct = 50;

      // Reduce TP if 4H is inside bar
      if (h4Dir === "neutral") tpPct = Math.round(tpPct * 0.7);

      const isSwing =
        (dailyBarType === "2U" || dailyBarType === "2D") &&
        h4Dir !== "neutral" &&
        btcAgreesWithAsset;

      const slPricePct = 0.30 / leverage;
      const tpPricePct = tpPct / 100 / leverage;

      return NextResponse.json({
        shouldTrade: true,
        direction,
        confidence: Math.min(100, Math.max(0, confidence)),
        tpPct,
        slPct: 30,
        isSwing,
        leverage,
        entry: currentPrice,
        sl:
          direction === "long"
            ? currentPrice * (1 - slPricePct)
            : currentPrice * (1 + slPricePct),
        tp:
          direction === "long"
            ? currentPrice * (1 + tpPricePct)
            : currentPrice * (1 - tpPricePct),
        reasoning: `Rule-based (no AI key): FTFC ${assetFTFC}, daily ${dailyBarType}, 4H ${h4BarType}, BTC ${btcFTFC}. Next key level ${distToNextKeyLevelPct.toFixed(1)}% away.`,
        trailTriggerPct: 20,
        trailRetreatPct: 35,
        ftfc: assetFTFC,
        weeklyDir,
        dailyDir,
        h4Dir,
        dailyBarType,
        h4BarType,
        btcFTFC,
        priorDayHigh,
        priorDayLow,
        priorWeekHigh,
        priorWeekLow,
        distToNextKeyLevelPct,
      });
    }

    // ── Claude-powered path ───────────────────────────────────────────────
    const prompt = `You are an expert crypto trader using TheStrat methodology by Rob Smith.
All pre-conditions have been verified: FTFC is ${assetFTFC} and 5-min break-and-hold is confirmed.
Your job is to determine optimal trade parameters.

${contextBlock}

Decide:
1. shouldTrade: Given all the above, is this a genuine high-probability entry? (It might still be "false" if the setup looks weak despite passing the filter.)
2. direction: "long" (FTFC bullish) or "short" (FTFC bearish)
3. confidence: 0-100
4. tpPct: 25-100 (% of margin for take profit, per the distance rules above)
5. isSwing: true if exceptional daily bar (strong 2U/2D) + full MTF alignment + BTC agrees → hold longer. Otherwise false (day trade).
6. trailTriggerPct: 15-40 (% of margin profit when trailing stop activates)
7. trailRetreatPct: 20-45 (% retrace from peak before closing to lock profit)
8. reasoning: one concise sentence explaining the trade decision

Return ONLY this JSON (no markdown, no extra text):
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
        ftfc: assetFTFC,
        weeklyDir,
        dailyDir,
        h4Dir,
        dailyBarType,
        h4BarType,
        btcFTFC,
        priorDayHigh,
        priorDayLow,
      });
    }

    const direction: "long" | "short" =
      ai.direction === "short" ? "short" : "long";
    const tpPct = Math.min(100, Math.max(25, ai.tpPct ?? 50));
    const slPricePct = 0.30 / leverage;
    const tpPricePct = tpPct / 100 / leverage;

    return NextResponse.json({
      shouldTrade: true,
      direction,
      confidence: Math.min(100, Math.max(0, ai.confidence ?? 60)),
      tpPct,
      slPct: 30,
      isSwing: ai.isSwing ?? false,
      leverage,
      entry: currentPrice,
      sl:
        direction === "long"
          ? currentPrice * (1 - slPricePct)
          : currentPrice * (1 + slPricePct),
      tp:
        direction === "long"
          ? currentPrice * (1 + tpPricePct)
          : currentPrice * (1 - tpPricePct),
      reasoning: ai.reasoning ?? "",
      trailTriggerPct: ai.trailTriggerPct ?? 20,
      trailRetreatPct: ai.trailRetreatPct ?? 35,
      ftfc: assetFTFC,
      weeklyDir,
      dailyDir,
      h4Dir,
      dailyBarType,
      h4BarType,
      btcFTFC,
      btcAgreesWithAsset,
      btcConflicts,
      priorDayHigh,
      priorDayLow,
      priorWeekHigh,
      priorWeekLow,
      distToNextKeyLevelPct,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("autotrade error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
