export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/market-data";

// Registry-aware candle fetch (routes crypto vs xyz equities/commodities dex)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asset = searchParams.get("asset") || "BTC";
  const interval = searchParams.get("interval") || "1h";
  const limit = parseInt(searchParams.get("limit") || "300", 10);

  try {
    const candles = await fetchCandles(asset, interval, limit);
    return NextResponse.json({ candles });
  } catch (e: any) {
    console.error("HL candles error:", e.message);
    return NextResponse.json({ error: e.message, candles: [] }, { status: 500 });
  }
}
