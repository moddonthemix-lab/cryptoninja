import { NextRequest, NextResponse } from "next/server";
import { getUserState, getFrontendOpenOrders, getUserFills } from "@/lib/hyperliquid";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const { searchParams } = new URL(req.url);

  // Priority: explicit param → session wallet → HL_MASTER_ADDRESS env var
  const address =
    searchParams.get("address") ||
    session.address ||
    process.env.HL_MASTER_ADDRESS;

  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  try {
    const [state, orders, fills, spotState] = await Promise.all([
      getUserState(address),
      getFrontendOpenOrders(address).catch(() => []),
      getUserFills(address).catch(() => []),
      // Also fetch spot balances so UI can detect USDC sitting in spot vs perp
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "spotClearinghouseState", user: address.toLowerCase() }),
      }).then(r => r.json()).catch(() => ({ balances: [] })),
    ]);

    const spotUsdc = (spotState.balances ?? []).find((b: any) => b.coin === "USDC");
    const spotUsdcBalance = spotUsdc ? parseFloat(spotUsdc.total) : 0;

    return NextResponse.json({ state, orders, fills, spotUsdcBalance });
  } catch (e: any) {
    console.error("HL account error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
