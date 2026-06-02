import { NextRequest, NextResponse } from "next/server";
import { getMarketData, getAllMids, HL_COINS } from "@/lib/hyperliquid";

export async function GET() {
  try {
    const [ctxs, mids] = await Promise.all([getMarketData(), getAllMids()]);

    const coins = Object.values(HL_COINS);
    const result: Record<string, any> = {};

    for (const coin of coins) {
      const mid = mids[coin];
      if (!mid) continue;
      result[coin] = {
        coin,
        price: parseFloat(mid),
        markPrice: mid,
      };
    }

    // Enrich with ctx data if available
    const meta = await import("@/lib/hyperliquid").then((m) => m.getMeta());
    ctxs.forEach((ctx, i) => {
      const name = meta.universe[i]?.name;
      if (!name || !coins.includes(name)) return;
      result[name] = {
        ...result[name],
        fundingRate: parseFloat(ctx.fundingRate) * 100,
        openInterest: parseFloat(ctx.openInterest),
        volume24h: parseFloat(ctx.dayNtlVlm),
        oraclePrice: parseFloat(ctx.oraclePx),
      };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("HL market error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
