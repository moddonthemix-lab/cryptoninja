import { NextRequest, NextResponse } from "next/server";
import { fetchCandles, fetchMarketData } from "@/lib/market-data";
import type { Asset } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const asset = symbol.toUpperCase() as Asset;
  const { searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") || "1h";
  const limit = parseInt(searchParams.get("limit") || "200");

  try {
    const [candles, marketData] = await Promise.all([
      fetchCandles(asset, interval, limit),
      fetchMarketData(asset),
    ]);
    return NextResponse.json({ candles, marketData });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
