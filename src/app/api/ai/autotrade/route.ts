import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { annotateCandles, detectPatterns } from "@/lib/thestrat";
import type { Asset, Candle } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";
const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000,
};

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

async function fetchCandles(coin: string, interval: string, limit: number): Promise<Candle[]> {
  // Hyperliquid uses human-readable intervals: "1m","5m","15m","1h","4h","1d"
  const hlInterval = interval; // our internal names already match HL format
  const endTime = Date.now();
  const startTime = endTime - (INTERVAL_MS[interval] ?? 3_600_000) * limit;
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval: hlInterval, startTime, endTime },
    }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("Candle fetch failed");
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

function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = (gains / period) / (losses / period || 0.0001);
  return 100 - 100 / (1 + rs);
}

function calcVolumeScore(candles: Candle[]): { score: number; label: string } {
  const recent = candles.slice(-5);
  const baseline = candles.slice(-20, -5);
  const avgRecent = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const avgBase = baseline.reduce((s, c) => s + c.volume, 0) / baseline.length || avgRecent;
  const ratio = avgRecent / avgBase;
  if (ratio > 2) return { score: 1.0, label: "very high" };
  if (ratio > 1.5) return { score: 0.75, label: "high" };
  if (ratio > 1.0) return { score: 0.5, label: "normal" };
  return { score: 0.25, label: "low" };
}

function calcMomentum(prices: number[]): { score: number; label: string } {
  const last5 = prices.slice(-5);
  const last2 = prices.slice(-2);
  const pct5 = (last5[last5.length - 1] - last5[0]) / last5[0] * 100;
  const pct2 = (last2[1] - last2[0]) / last2[0] * 100;
  const combined = pct5 * 0.6 + pct2 * 40;
  const abs = Math.abs(combined);
  if (abs > 3) return { score: 1.0, label: "strong" };
  if (abs > 1.5) return { score: 0.7, label: "moderate" };
  if (abs > 0.5) return { score: 0.4, label: "weak" };
  return { score: 0.1, label: "flat" };
}

export async function POST(req: NextRequest) {
  try {
    const { asset, leverage = 3 } = await req.json();

    const [candles1h, candles15m] = await Promise.all([
      fetchCandles(asset, "1h", 60),
      fetchCandles(asset, "15m", 60),
    ]);

    if (candles1h.length < 10) {
      return NextResponse.json({ shouldTrade: false, reason: "Insufficient candle data" });
    }

    const prices = candles1h.map((c) => c.close);
    const currentPrice = prices[prices.length - 1];
    const rsi = calcRSI(prices);
    const volume = calcVolumeScore(candles1h);
    const momentum = calcMomentum(prices);

    // TheStrat pattern detection on both timeframes
    const annotated1h = annotateCandles(candles1h);
    const annotated15m = annotateCandles(candles15m);
    const patterns1h = detectPatterns(annotated1h, 10);
    const patterns15m = detectPatterns(annotated15m, 10);

    const recentTypes1h = annotated1h.slice(-5).map((c) => c.stratType).join("-");
    const recentTypes15m = annotated15m.slice(-5).map((c) => c.stratType).join("-");
    const topPattern1h = patterns1h[patterns1h.length - 1]?.pattern;
    const topPattern15m = patterns15m[patterns15m.length - 1]?.pattern;

    const last5 = annotated1h.slice(-5).map((c) =>
      `${c.stratType} (o:${c.open.toFixed(2)} h:${c.high.toFixed(2)} l:${c.low.toFixed(2)} c:${c.close.toFixed(2)} vol:${c.volume.toFixed(0)})`
    ).join("\n");

    if (!process.env.ANTHROPIC_API_KEY) {
      // Fallback: rule-based signal when no API key
      const bullish = rsi < 45 && momentum.label !== "flat" && topPattern1h?.direction === "bullish";
      const bearish = rsi > 55 && momentum.label !== "flat" && topPattern1h?.direction === "bearish";
      if (!bullish && !bearish) {
        return NextResponse.json({ shouldTrade: false, reason: "No clear signal (no AI key)" });
      }
      const direction = bullish ? "long" : "short";
      const tpPct = 40 + Math.round(volume.score * 30);
      const slPricePct = 0.30 / leverage;
      const tpPricePct = tpPct / 100 / leverage;
      return NextResponse.json({
        shouldTrade: true, direction, confidence: 55,
        tpPct, slPct: 30, leverage,
        entry: currentPrice,
        sl: direction === "long" ? currentPrice * (1 - slPricePct) : currentPrice * (1 + slPricePct),
        tp: direction === "long" ? currentPrice * (1 + tpPricePct) : currentPrice * (1 - tpPricePct),
        reasoning: `Rule-based: RSI ${rsi.toFixed(0)}, volume ${volume.label}, momentum ${momentum.label}`,
        momentum: momentum.label, volumeLabel: volume.label,
      });
    }

    const prompt = `You are an expert crypto trader analyzing ${asset}/USDT for an automated paper trading system.

CURRENT MARKET STATE:
- Price: $${currentPrice.toFixed(4)}
- RSI(14): ${rsi.toFixed(1)} ${rsi > 70 ? "(overbought)" : rsi < 30 ? "(oversold)" : ""}
- Volume vs 20-bar avg: ${volume.label} (${(volume.score * 100).toFixed(0)}% relative strength)
- Price momentum (5-bar): ${momentum.label}

THESTRAT CANDLE TYPES (1h last 5 candles):
${last5}
1h sequence: ${recentTypes1h}
15m sequence: ${recentTypes15m}
${topPattern1h ? `1h pattern: ${topPattern1h.name} (${topPattern1h.direction})` : "1h: no pattern"}
${topPattern15m ? `15m pattern: ${topPattern15m.name} (${topPattern15m.direction})` : "15m: no pattern"}

TASK: Decide if this is worth an automated paper trade right now.

Rules:
- SL is FIXED at 30% of margin (price = ±${(0.30 / leverage * 100).toFixed(1)}% from entry at ${leverage}x leverage)
- TP is DYNAMIC: 25–100% of margin based on your read of momentum and conviction
- Only trade if you have meaningful conviction — uncertain setups = no trade
- Both timeframes should ideally agree

Return ONLY this JSON (no markdown, no explanation outside the JSON):
{
  "shouldTrade": true or false,
  "direction": "long" or "short",
  "confidence": 0-100,
  "tpPct": 25 to 100 (percent of margin for take profit),
  "reasoning": "one sentence why",
  "momentum": "weak/moderate/strong",
  "trailTriggerPct": 15 to 40 (% of margin profit before trailing stop activates),
  "trailRetreatPct": 20 to 45 (% retrace from peak before closing to lock profit)
}`;

    const msg = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const ai = JSON.parse(jsonMatch[0]);

    if (!ai.shouldTrade) {
      return NextResponse.json({
        shouldTrade: false,
        reason: ai.reasoning ?? "No trade",
        detectedPatterns: [topPattern1h?.name, topPattern15m?.name].filter(Boolean),
        rsi, volumeLabel: volume.label, momentum: momentum.label,
      });
    }

    const direction: "long" | "short" = ai.direction === "short" ? "short" : "long";
    const tpPct = Math.min(100, Math.max(25, ai.tpPct ?? 50));
    const slPricePct = 0.30 / leverage;
    const tpPricePct = (tpPct / 100) / leverage;

    return NextResponse.json({
      shouldTrade: true,
      direction,
      confidence: Math.min(100, Math.max(0, ai.confidence ?? 60)),
      tpPct,
      slPct: 30,
      leverage,
      entry: currentPrice,
      sl: direction === "long"
        ? currentPrice * (1 - slPricePct)
        : currentPrice * (1 + slPricePct),
      tp: direction === "long"
        ? currentPrice * (1 + tpPricePct)
        : currentPrice * (1 - tpPricePct),
      reasoning: ai.reasoning ?? "",
      momentum: ai.momentum ?? momentum.label,
      volumeLabel: volume.label,
      trailTriggerPct: ai.trailTriggerPct ?? 20,
      trailRetreatPct: ai.trailRetreatPct ?? 35,
      rsi,
      pattern1h: topPattern1h?.name,
      pattern15m: topPattern15m?.name,
    });
  } catch (e: any) {
    console.error("autotrade error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
