export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { botState } from "@/lib/botState";

// The open browser pings this so the server cron knows a human is present and
// defers to the in-browser bot. When these stop (laptop closed), the cron takes
// over 24/7. No secret needed — it only records a timestamp.
export async function POST(req: Request) {
  botState.lastHeartbeat = Date.now();
  // Sync copy-trade config + currently-copied coins so the cron can take over
  // mirroring (incl. close-follow) when the browser goes away.
  try {
    const b: any = await req.json();
    if (b && typeof b === "object") {
      if ("copyConfig" in b) botState.copyConfig = b.copyConfig;
      if (Array.isArray(b.copyOpenCoins)) {
        botState.copyOpen = {};
        for (const c of b.copyOpenCoins) if (c) botState.copyOpen[c] = true;
      }
    }
  } catch { /* heartbeat without body is fine */ }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  botState.lastHeartbeat = Date.now();
  return NextResponse.json({ ok: true, ts: botState.lastHeartbeat });
}
