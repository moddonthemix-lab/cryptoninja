export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getUserFills } from "@/lib/hyperliquid";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

interface DayAgg {
  date: string;       // YYYY-MM-DD
  pnl: number;        // net realized (closedPnl - fees)
  wins: number;
  losses: number;
  volume: number;     // notional traded
  fees: number;
  trades: number;     // closing fills
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || session.address || process.env.HL_MASTER_ADDRESS;
  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  try {
    const fills = await getUserFills(address);

    const byDay: Record<string, DayAgg> = {};
    let realizedPnl = 0, wins = 0, losses = 0, totalVolume = 0, fees = 0, trades = 0;

    for (const f of fills) {
      const px = parseFloat(f.px);
      const sz = parseFloat(f.sz);
      const pnl = parseFloat(f.closedPnl ?? "0");
      const fee = parseFloat(f.fee ?? "0");
      const notional = px * sz;
      const isClose = typeof f.dir === "string" && /close/i.test(f.dir);
      const day = new Date(f.time).toISOString().slice(0, 10);

      totalVolume += notional;
      fees += fee;

      if (!byDay[day]) byDay[day] = { date: day, pnl: 0, wins: 0, losses: 0, volume: 0, fees: 0, trades: 0 };
      byDay[day].volume += notional;
      byDay[day].fees += fee;

      // Only closing fills realize PnL / count as W/L
      if (isClose && pnl !== 0) {
        const net = pnl - fee;
        realizedPnl += net;
        trades += 1;
        byDay[day].pnl += net;
        byDay[day].trades += 1;
        if (pnl > 0) { wins += 1; byDay[day].wins += 1; }
        else { losses += 1; byDay[day].losses += 1; }
      }
    }

    const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

    return NextResponse.json({
      realizedPnl, winRate, wins, losses, totalVolume, fees, trades,
      fillCount: fills.length,
      daily,
    });
  } catch (e: any) {
    console.error("HL portfolio error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
