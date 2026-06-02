import { NextRequest, NextResponse } from "next/server";
import { getCandles, HL_INTERVALS, intervalToLookback, HL_COINS } from "@/lib/hyperliquid";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asset = searchParams.get("asset") || "BTC";
  const interval = searchParams.get("interval") || "1h";

  const coin = HL_COINS[asset] || asset;
  const hlInterval = HL_INTERVALS[interval] || "1h";
  const lookback = intervalToLookback(interval);
  const startTime = Date.now() - lookback;

  try {
    const candles = await getCandles(coin, hlInterval, startTime);
    const formatted = candles.map((c) => ({
      time: Math.floor(c.t / 1000),
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
    return NextResponse.json({ candles: formatted, coin, interval: hlInterval });
  } catch (e: any) {
    console.error("HL candles error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
