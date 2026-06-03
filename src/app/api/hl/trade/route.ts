import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { submitWithAgent, isAgentConfigured } from "@/lib/hl-agent";

const HL_EXCHANGE = "https://api.hyperliquid.xyz/exchange";

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAuthenticated || !session.address) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, nonce, signature, vaultAddress } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    // ── Agent-key path (preferred): sign server-side, no wallet popup ──────
    if (isAgentConfigured()) {
      const masterAddress = vaultAddress || session.address;
      const data = await submitWithAgent(action, masterAddress);
      return NextResponse.json(data);
    }

    // ── Fallback: client sent a pre-signed payload (wallet-signed) ──────────
    if (!nonce || !signature) {
      return NextResponse.json(
        { error: "Agent key not configured and no signature provided. Set HL_AGENT_PRIVATE_KEY in env vars." },
        { status: 400 }
      );
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
