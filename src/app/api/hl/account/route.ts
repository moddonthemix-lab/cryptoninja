import { NextRequest, NextResponse } from "next/server";
import { getUserState, getOpenOrders, getUserFills } from "@/lib/hyperliquid";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const { searchParams } = new URL(req.url);

  // Allow explicit address override for demo/guest view
  const address = searchParams.get("address") || session.address;
  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  try {
    const [state, orders, fills] = await Promise.all([
      getUserState(address),
      getOpenOrders(address),
      getUserFills(address).catch(() => []),
    ]);

    return NextResponse.json({ state, orders, fills });
  } catch (e: any) {
    console.error("HL account error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
