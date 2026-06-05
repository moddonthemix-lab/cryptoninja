export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// Visit once to register the Telegram webhook so /long /short /close /status work.
//   /api/telegram/setup?secret=YOUR_CRON_SECRET
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 400 });

  const webhookUrl = `${url.protocol}//${url.host}/api/telegram/webhook`;
  const body: any = { url: webhookUrl, allowed_updates: ["message"] };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json({ registeredTo: webhookUrl, telegram: data });
}
