import { NextRequest, NextResponse } from "next/server";

const HL_INFO = "https://api.hyperliquid.xyz/info";

// Open interest + funding + mark for a coin, used to infer fresh longs vs shorts.
const CACHE_TTL_MS = 8_000;
const cache = new Map<string, { ts: number; payload: any }>();

export async function GET(req: NextRequest) {
  const coin = new URL(req.url).searchParams.get("coin")?.trim();
  if (!coin) return NextResponse.json({ error: "coin required" }, { status: 400 });

  const hit = cache.get(coin);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return NextResponse.json(hit.payload);

  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    if (!res.ok) throw new Error(`ctx ${res.status}`);
    const [meta, ctxs] = await res.json();
    const idx = meta.universe.findIndex((u: any) => u.name === coin);
    if (idx < 0) return NextResponse.json({ error: "coin not found" }, { status: 404 });
    const c = ctxs[idx];
    const payload = {
      coin,
      markPx: parseFloat(c.markPx),
      oraclePx: parseFloat(c.oraclePx),
      prevDayPx: parseFloat(c.prevDayPx),
      funding: parseFloat(c.funding),          // hourly funding rate
      openInterest: parseFloat(c.openInterest), // in base units
      dayNtlVlm: parseFloat(c.dayNtlVlm),
      premium: parseFloat(c.premium ?? "0"),
    };
    cache.set(coin, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
