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
    const rows = (Array.isArray(fills) ? fills : [])
      .filter((f: any) => (parseFloat(f.closedPnl ?? "0") || 0) !== 0) // closes only
      .map((f: any) => {
        const sym = String(f.coin).replace(/^xyz:/, "");
        const dir: "long" | "short" = /short/i.test(f.dir || "") ? "short" : "long";
        const pnl = (parseFloat(f.closedPnl ?? "0") || 0) - (parseFloat(f.fee ?? "0") || 0);
        return {
          id: `${f.hash || ""}_${f.tid || f.time}`,
          asset: sym,
          direction: dir,
          exitPrice: parseFloat(f.px ?? "0") || 0,
          size: parseFloat(f.sz ?? "0") || 0,
          pnl,
          closeReason: f.dir || "close",   // e.g. "Close Long"
          mode: "live" as const,
          time: f.time ?? 0,
        };
      })
      .sort((a, b) => b.time - a.time)
      .slice(0, 100);

    const payload = { rows };
    cache.set(address, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
