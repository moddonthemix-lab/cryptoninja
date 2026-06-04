import { NextRequest, NextResponse } from "next/server";
import { getUserState, getUserStateDex } from "@/lib/hyperliquid";

// Read-only snapshot of any trader's open positions + account value, used by the
// copy-trading tab to preview a target and by the mirror engine to replicate.
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { ts: number; payload: any }>();

export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address")?.trim().toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const hit = cache.get(address);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return NextResponse.json(hit.payload);

  try {
    const [main, xyz] = await Promise.all([
      getUserState(address),
      getUserStateDex(address, "xyz").catch(() => null),
    ]);

    const mapPos = (ap: any, dex: "" | "xyz") => {
      const p = ap.position;
      const szi = parseFloat(p.szi);
      return {
        coin: dex === "xyz" && !String(p.coin).startsWith("xyz:") ? `xyz:${p.coin}` : p.coin,
        direction: szi >= 0 ? "long" : "short",
        size: Math.abs(szi),
        entryPx: parseFloat(p.entryPx),
        leverage: p.leverage?.value ?? 1,
        positionValue: parseFloat(p.positionValue ?? "0"),
        unrealizedPnl: parseFloat(p.unrealizedPnl ?? "0"),
      };
    };

    const positions = [
      ...((main as any)?.assetPositions ?? []).map((ap: any) => mapPos(ap, "")),
      ...((xyz as any)?.assetPositions ?? []).map((ap: any) => mapPos(ap, "xyz")),
    ].filter((p) => p.size > 0);

    const accountValue = parseFloat((main as any)?.crossMarginSummary?.accountValue ?? "0") || 0;

    const payload = { address, accountValue, positions };
    cache.set(address, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
