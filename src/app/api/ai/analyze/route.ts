import { NextRequest, NextResponse } from "next/server";
import { getAITradingSignal, getAIMarketOverview } from "@/lib/anthropic";
import { fetchCandles, fetchMarketData, fetchAllMarketData } from "@/lib/market-data";
import type { Asset } from "@/types";

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const { asset, strategyContext } = await req.json();
    const [candles, marketData] = await Promise.all([
      fetchCandles(asset as Asset, "1h", 50),
      fetchMarketData(asset as Asset),
    ]);
    const signal = await getAITradingSignal(asset, candles, marketData, strategyContext);
    return NextResponse.json(signal);
  } catch (error: any) {
    console.error("AI analyze error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const allMarketData = await fetchAllMarketData();

    if (!process.env.ANTHROPIC_API_KEY) {
      // Return market data without AI overview
      return NextResponse.json({ overview: null, marketData: allMarketData });
    }

    const overview = await getAIMarketOverview(allMarketData);
    return NextResponse.json({ overview, marketData: allMarketData });
  } catch (error: any) {
    console.error("AI overview error:", error?.message ?? error);
    return NextResponse.json({ error: "Overview failed" }, { status: 500 });
  }
}
