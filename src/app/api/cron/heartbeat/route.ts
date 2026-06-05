export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { botState } from "@/lib/botState";

// The open browser pings this so the server cron knows a human is present and
// defers to the in-browser bot. When these stop (laptop closed), the cron takes
// over 24/7. No secret needed — it only records a timestamp.
export async function POST() {
  botState.lastHeartbeat = Date.now();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  botState.lastHeartbeat = Date.now();
  return NextResponse.json({ ok: true, ts: botState.lastHeartbeat });
}
