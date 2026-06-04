import { NextRequest, NextResponse } from "next/server";
import { getUserState, getUserStateDex, getFrontendOpenOrders } from "@/lib/hyperliquid";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

// ── Server-side cache ─────────────────────────────────────────────────────────
// Many components mount useHyperliquid() and each polls. Without a cache every
// poll fans out to Hyperliquid and we get rate-limited (HTTP 429). We cache the
// composed response per address for a few seconds and serve stale data if a
// refresh fails, so a transient 429 never breaks the UI.
const CACHE_TTL_MS = 8_000;
type Cached = { ts: number; payload: any };
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<any>>();

async function fetchSpotUsdc(address: string): Promise<number> {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotClearinghouseState", user: address.toLowerCase() }),
    });
    if (!res.ok) throw new Error(`spot ${res.status}`);
    const spotState = await res.json();
    const usdc = (spotState?.balances ?? []).find((b: any) => b?.coin === "USDC");
    return usdc ? parseFloat(usdc.total) || 0 : 0;
  } catch {
    return 0;
  }
}

async function loadAccount(address: string) {
  // state + orders are required; spot + xyz-dex are best-effort
  const [state, xyzState, orders, spotUsdcBalance] = await Promise.all([
    getUserState(address),
    getUserStateDex(address, "xyz").catch(() => null),  // stocks/commodities dex
    getFrontendOpenOrders(address).catch(() => []),
    fetchSpotUsdc(address),
  ]);

  // Merge xyz-dex (stocks/commodities) positions so they show alongside crypto.
  // Tag their coin with the "xyz:" prefix the UI already strips for display.
  const xyzPositions = (xyzState?.assetPositions ?? []).map((ap: any) => ({
    ...ap,
    position: {
      ...ap.position,
      coin: String(ap.position?.coin ?? "").startsWith("xyz:")
        ? ap.position.coin
        : `xyz:${ap.position?.coin}`,
    },
  }));
  if (xyzPositions.length && state?.assetPositions) {
    state.assetPositions = [...state.assetPositions, ...xyzPositions];
  } else if (xyzPositions.length) {
    (state as any).assetPositions = xyzPositions;
  }

  // The xyz dex is a SEPARATE margin account — surface its equity/withdrawable/
  // margin so total equity reflects funds held there (e.g. for stock positions).
  const xyzSummary: any = (xyzState as any)?.crossMarginSummary;
  const xyzAccountValue = xyzSummary ? parseFloat(xyzSummary.accountValue) || 0 : 0;
  const xyzWithdrawable = (xyzState as any)?.withdrawable ? parseFloat((xyzState as any).withdrawable) || 0 : 0;
  const xyzMarginUsed = xyzSummary ? parseFloat(xyzSummary.totalMarginUsed) || 0 : 0;

  return { state, orders, spotUsdcBalance, xyzAccountValue, xyzWithdrawable, xyzMarginUsed };
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const { searchParams } = new URL(req.url);

  // Priority: explicit param → session wallet → HL_MASTER_ADDRESS env var
  const address =
    searchParams.get("address") ||
    session.address ||
    process.env.HL_MASTER_ADDRESS;

  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  const key = address.toLowerCase();
  const now = Date.now();
  const cached = cache.get(key);

  // Fresh cache hit — serve immediately, no HL call
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  try {
    // Coalesce concurrent refreshes for the same address into one HL round-trip
    let p = inflight.get(key);
    if (!p) {
      p = loadAccount(address).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const payload = await p;
    cache.set(key, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    // On error (e.g. 429), serve the last good payload rather than breaking the UI
    if (cached) {
      return NextResponse.json({ ...cached.payload, stale: true });
    }
    console.error("HL account error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
