import { NextRequest, NextResponse } from "next/server";
import { getUserFills } from "@/lib/hyperliquid";

// Live closed-trade history from Hyperliquid fills (closing fills realize PnL).
const TTL_MS = 15_000;
const cache = new Map<string, { ts: number; payload: any }>();

export async function GET(req: NextRequest) {
  const address = (new URL(req.url).searchParams.get("address") || process.env.HL_MASTER_ADDRESS || "").toLowerCase();
  if (!address) return NextResponse.json({ error: "no address" }, { status: 400 });

  const hit = cache.get(address);
  if (hit && Date.now() - hit.ts < TTL_MS) return NextResponse.json(hit.payload);

  try {
    const fills = await getUserFills(address);
    // Replay fills chronologically per coin to reconstruct each closed trade's
    // average ENTRY price (so we can show entry + exact PnL%).
    const sorted = (Array.isArray(fills) ? fills : []).slice().sort((a: any, b: any) => (a.time ?? 0) - (b.time ?? 0));
    const pos: Record<string, { size: number; avg: number }> = {}; // signed size, avg entry
    const rows: any[] = [];

    for (const f of sorted) {
      const sym = String(f.coin).replace(/^xyz:/, "");
      const px = parseFloat(f.px ?? "0") || 0;
      const sz = parseFloat(f.sz ?? "0") || 0;
      const signed = f.side === "B" ? sz : -sz;
      const closedPnl = parseFloat(f.closedPnl ?? "0") || 0;
      const fee = parseFloat(f.fee ?? "0") || 0;
      const p = pos[sym] || { size: 0, avg: 0 };

      const sameDir = p.size === 0 || Math.sign(p.size) === Math.sign(signed);
      if (sameDir) {
        // adding to / opening the position → update average entry
        const newAbs = Math.abs(p.size) + sz;
        p.avg = newAbs > 0 ? (p.avg * Math.abs(p.size) + px * sz) / newAbs : px;
        p.size += signed;
      } else {
        // reducing / closing → record a trade row using the tracked entry
        const closedSize = Math.min(sz, Math.abs(p.size));
        const wasLong = p.size > 0;
        const entry = p.avg;
        const pnlPercent = entry > 0 && closedSize > 0 ? (closedPnl / (entry * closedSize)) * 100 : 0;
        rows.push({
          id: `${f.hash || ""}_${f.tid || f.time}`,
          asset: sym,
          direction: wasLong ? "long" : "short",
          entryPrice: entry,
          exitPrice: px,
          size: closedSize,
          pnl: closedPnl - fee,
          pnlPercent,
          closeReason: f.dir || "close",
          mode: "live" as const,
          time: f.time ?? 0,
        });
        p.size += signed;
        if (Math.sign(p.size) !== 0 && Math.sign(p.size) !== (wasLong ? 1 : -1)) p.avg = px; // flipped → new entry
      }
      pos[sym] = p;
    }

    const payload = { rows: rows.sort((a, b) => b.time - a.time).slice(0, 100) };
    cache.set(address, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
