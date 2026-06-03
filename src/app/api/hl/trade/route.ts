import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";
import { submitWithAgent, isAgentConfigured } from "@/lib/hl-agent";

const HL_EXCHANGE = "https://api.hyperliquid.xyz/exchange";

// Resolve the master wallet address: explicit body param → session wallet → env var
function getMasterAddress(bodyVault?: string, sessionAddress?: string): string | null {
  return bodyVault || sessionAddress || process.env.HL_MASTER_ADDRESS || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, nonce, signature, vaultAddress } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    // ── Agent-key path: sign server-side, no wallet required ────────────────
    if (isAgentConfigured()) {
      const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
      const masterAddress = getMasterAddress(vaultAddress, session.address);
      if (!masterAddress) {
        return NextResponse.json(
          { error: "Set HL_MASTER_ADDRESS in env vars (or connect wallet)" },
          { status: 400 }
        );
      }
      const data = await submitWithAgent(action, masterAddress);
      return NextResponse.json(data);
    }

    // ── Fallback: client-signed payload (wallet connected) ──────────────────
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.isAuthenticated || !session.address) {
      return NextResponse.json(
        { error: "No agent key configured. Connect wallet and sign in, or set HL_AGENT_PRIVATE_KEY." },
        { status: 401 }
      );
    }
    if (!nonce || !signature) {
      return NextResponse.json({ error: "Missing nonce or signature" }, { status: 400 });
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
