import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { getAITradingSignal, getAIMarketOverview } from "@/lib/anthropic";
import { fetchCandles, fetchMarketData, fetchAllMarketData } from "@/lib/market-data";
import type { Asset } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { asset, strategyContext } = await req.json();

  try {
    const [candles, marketData] = await Promise.all([
      fetchCandles(asset as Asset, "1h", 50),
      fetchMarketData(asset as Asset),
    ]);

    const signal = await getAITradingSignal(asset, candles, marketData, strategyContext);
    return NextResponse.json(signal);
  } catch (error) {
    console.error("AI analyze error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const allMarketData = await fetchAllMarketData();
    const overview = await getAIMarketOverview(allMarketData);
    return NextResponse.json({ overview, marketData: allMarketData });
  } catch (error) {
    return NextResponse.json({ error: "Overview failed" }, { status: 500 });
  }
}
