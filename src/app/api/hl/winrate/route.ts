import { NextRequest, NextResponse } from "next/server";
import { getUserFills } from "@/lib/hyperliquid";

// Win rate for a wallet, computed from closing fills' realized PnL.
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { ts: number; payload: any }>();

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address")?.trim().toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  const hit = cache.get(address);
  if (hit && Date.now() - hit.ts < TTL_MS) return NextResponse.json(hit.payload);

  try {
    const fills = await getUserFills(address);
    let wins = 0, losses = 0, realized = 0, fees = 0;
    for (const f of (Array.isArray(fills) ? fills : [])) {
      const pnl = parseFloat(f.closedPnl ?? "0") || 0;
      fees += parseFloat(f.fee ?? "0") || 0;
      if (pnl === 0) continue; // only closing fills realize PnL
      realized += pnl;
      if (pnl > 0) wins++; else losses++;
    }
    const trades = wins + losses;
    const payload = {
      address,
      winRate: trades > 0 ? (wins / trades) * 100 : 0,
      wins, losses, trades,
      realized: realized - fees,
    };
    cache.set(address, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
