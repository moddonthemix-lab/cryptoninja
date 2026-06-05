import { NextRequest, NextResponse } from "next/server";
import { getUserFills } from "@/lib/hyperliquid";

// Realized PnL (net of fees) since a given timestamp — used for the correct
// "today's total" in Telegram alerts. `since` is the start of the user's LOCAL
// day (ms), passed by the client so the day boundary matches their timezone.
const TTL_MS = 15_000;
const cache = new Map<string, { ts: number; payload: any }>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || process.env.HL_MASTER_ADDRESS || "").toLowerCase();
  const since = parseInt(searchParams.get("since") || "0", 10) || 0;
  if (!address) return NextResponse.json({ error: "no address" }, { status: 400 });

  const key = `${address}:${since}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return NextResponse.json(hit.payload);

  try {
    const fills = await getUserFills(address);
    let realized = 0, count = 0;
    for (const f of (Array.isArray(fills) ? fills : [])) {
      if ((f.time ?? 0) < since) continue;
      const pnl = parseFloat(f.closedPnl ?? "0") || 0;
      const fee = parseFloat(f.fee ?? "0") || 0;
      if (pnl === 0) continue;          // only closing fills realize PnL
      realized += pnl - fee;
      count++;
    }
    const payload = { realized, count, since };
    cache.set(key, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
