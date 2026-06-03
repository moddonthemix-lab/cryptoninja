import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

const HL_EXCHANGE = "https://api.hyperliquid.xyz/exchange";

// Proxy signed actions to Hyperliquid exchange endpoint.
// Signing happens client-side — this route just forwards and returns the result.
export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated || !session.address) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, nonce, signature, vaultAddress } = body;

    if (!action || !nonce || !signature) {
      return NextResponse.json({ error: "Missing action, nonce, or signature" }, { status: 400 });
    }

    const payload: Record<string, unknown> = { action, nonce, signature };
    if (vaultAddress) payload.vaultAddress = vaultAddress;

    const res = await fetch(HL_EXCHANGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? "Exchange error" }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("HL trade proxy error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
