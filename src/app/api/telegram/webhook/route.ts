export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  getUserState, getUserStateDex, getAllMids,
  buildOrderAction, buildSetLeverageAction, buildPositionTpSlAction,
} from "@/lib/hyperliquid";
import { submitWithAgent, isAgentConfigured } from "@/lib/hl-agent";

const CMD_RISK = 0.30; // 30% of free margin per quick command

async function tg(token: string, chatId: string, message: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

async function freeMargin(master: string): Promise<number> {
  const st: any = await getUserState(master);
  const cms = st?.crossMarginSummary;
  const av = parseFloat(cms?.accountValue || "0") || 0;
  const mu = parseFloat(cms?.totalMarginUsed || "0") || 0;
  const wd = parseFloat(st?.withdrawable || "0") || 0;
  return Math.max(av - mu, wd, 0);
}

async function openPositions(master: string) {
  const [main, xyz] = await Promise.all([getUserState(master), getUserStateDex(master, "xyz").catch(() => null)]);
  const out: Array<{ coin: string; szi: number; entryPx: number; upnl: number; mark: number }> = [];
  const collect = (st: any, dex: "" | "xyz") => ((st?.assetPositions) || []).forEach((ap: any) => {
    const p = ap.position; const szi = parseFloat(p.szi); if (!szi) return;
    const coin = dex === "xyz" && !String(p.coin).startsWith("xyz:") ? `xyz:${p.coin}` : p.coin;
    const posVal = parseFloat(p.positionValue || "0") || 0;
    const mark = Math.abs(szi) > 0 && posVal > 0 ? posVal / Math.abs(szi) : parseFloat(p.entryPx);
    out.push({ coin, szi, entryPx: parseFloat(p.entryPx), upnl: parseFloat(p.unrealizedPnl || "0"), mark });
  });
  collect(main, ""); collect(xyz, "xyz");
  return out;
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return NextResponse.json({ ok: true }); // not configured, ignore

  // Optional shared-secret check (set when registering the webhook)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: true });
  }

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const msg = update?.message ?? update?.edited_message;
  const text: string = (msg?.text || "").trim();
  const from = String(msg?.chat?.id ?? "");
  if (!text || from !== String(chatId)) return NextResponse.json({ ok: true }); // only the owner

  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@.*$/, "");
  const arg = (parts[1] || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // optional ticker
  const origin = `${new URL(req.url).protocol}//${new URL(req.url).host}`;
  const master = process.env.HL_MASTER_ADDRESS;
  const leverage = parseInt(process.env.CRON_LEVERAGE || "3", 10);

  try {
    if (cmd === "/help" || cmd === "/start") {
      await tg(token, chatId, `🥷 <b>CryptoNinja commands</b>\n/long — open a long on BTC\n/short — open a short on BTC\n/close — close ALL open positions\n/close BTC — close just that ticker\n/status — account + open positions`);
      return NextResponse.json({ ok: true });
    }

    if (!isAgentConfigured() || !master) {
      await tg(token, chatId, "⚠️ Agent key / master address not configured — can't trade.");
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/status") {
      const st: any = await getUserState(master);
      const cms = st?.crossMarginSummary;
      const equity = parseFloat(cms?.accountValue || "0") || 0;
      const free = await freeMargin(master);
      const pos = await openPositions(master);
      const lines = pos.length
        ? pos.map((p) => `${p.szi > 0 ? "LONG" : "SHORT"} ${p.coin.replace(/^xyz:/, "")} · uPnL ${p.upnl >= 0 ? "+" : ""}$${p.upnl.toFixed(2)}`).join("\n")
        : "No open positions";
      await tg(token, chatId, `📊 <b>Status</b>\nEquity: $${equity.toFixed(2)} · Free: $${free.toFixed(2)}\n${lines}`);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/long" || cmd === "/short") {
      const isBuy = cmd === "/long";
      const meta = await (await fetch(`${origin}/api/hl/meta`)).json();
      const info = meta["BTC"];
      if (!info) { await tg(token, chatId, "⚠️ BTC meta unavailable."); return NextResponse.json({ ok: true }); }

      // Don't stack — one asset at a time
      const existing = (await openPositions(master)).find((p) => p.coin === "BTC");
      if (existing) { await tg(token, chatId, `⚠️ Already in a BTC position (${existing.szi > 0 ? "LONG" : "SHORT"}). Use /close first.`); return NextResponse.json({ ok: true }); }

      const mids = await getAllMids();
      const price = parseFloat(mids["BTC"] || "0") || 0;
      const free = await freeMargin(master);
      if (price <= 0 || free <= 0) { await tg(token, chatId, `⚠️ No free margin ($${free.toFixed(2)}).`); return NextResponse.json({ ok: true }); }

      let notional = Math.max(10, free * CMD_RISK * leverage);
      const size = notional / price;
      const sl = isBuy ? price * (1 - 0.23 / leverage) : price * (1 + 0.23 / leverage);
      const tp = isBuy ? price * (1 + 0.30 / leverage) : price * (1 - 0.30 / leverage);

      await submitWithAgent(buildSetLeverageAction(info.assetId, Math.min(leverage, info.maxLeverage), true), master).catch(() => {});
      const od: any = await submitWithAgent(buildOrderAction(info.assetId, isBuy, isBuy ? price * 1.01 : price * 0.99, size, false, "Ioc", info.szDecimals), master);
      if (od?.status !== "ok") { await tg(token, chatId, `❌ Order failed: ${od?.response ?? od?.error ?? "unknown"}`); return NextResponse.json({ ok: true }); }
      await submitWithAgent(buildPositionTpSlAction(info.assetId, isBuy, size, tp, sl, info.szDecimals), master).catch(() => {});

      await tg(token, chatId, `${isBuy ? "🟩" : "🟥"} <b>${isBuy ? "LONG" : "SHORT"} BTC</b> ${leverage}x @ $${price.toFixed(2)}\nSize ${size.toFixed(5)} · SL $${sl.toFixed(2)} · TP $${tp.toFixed(2)}`);
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/close") {
      const meta = await (await fetch(`${origin}/api/hl/meta`)).json();
      const metaByCoin: Record<string, any> = {};
      Object.values(meta as Record<string, any>).forEach((m: any) => { metaByCoin[m.hlCoin] = m; });
      let positions = await openPositions(master);
      if (!positions.length) { await tg(token, chatId, "No open positions to close."); return NextResponse.json({ ok: true }); }

      // /close BTC → only that ticker; /close → all
      if (arg) {
        positions = positions.filter((p) => p.coin.replace(/^xyz:/, "").toUpperCase() === arg);
        if (!positions.length) {
          const have = (await openPositions(master)).map((p) => p.coin.replace(/^xyz:/, "")).join(", ") || "none";
          await tg(token, chatId, `No <b>${arg}</b> position. Open: ${have}`);
          return NextResponse.json({ ok: true });
        }
      }

      for (const p of positions) {
        const info = metaByCoin[p.coin]; if (!info) { await tg(token, chatId, `⚠️ No meta for ${p.coin}`); continue; }
        const isLong = p.szi > 0;
        const closeBuy = !isLong; // close long = sell, close short = buy
        // Bias 3% past the mark so the reduce-only IOC definitely fills
        const limitPx = closeBuy ? p.mark * 1.03 : p.mark * 0.97;
        const sym = p.coin.replace(/^xyz:/, "");
        const od: any = await submitWithAgent(
          buildOrderAction(info.assetId, closeBuy, limitPx, Math.abs(p.szi), true, "Ioc", info.szDecimals), master
        );
        const st = od?.response?.data?.statuses?.[0];
        const errMsg = od?.status !== "ok" ? (typeof od?.response === "string" ? od.response : JSON.stringify(od?.response ?? od)) : (st?.error || null);
        if (!errMsg) {
          await tg(token, chatId, `🟦 <b>CLOSED ${isLong ? "LONG" : "SHORT"} ${sym}</b> @ ~$${p.mark.toFixed(p.mark < 1 ? 5 : 2)}\nPnL: <b>${p.upnl >= 0 ? "+" : "-"}$${Math.abs(p.upnl).toFixed(2)}</b>`);
        } else {
          await tg(token, chatId, `❌ Close ${sym} failed: ${errMsg}`);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await tg(token, chatId, `❌ Command error: ${e.message}`);
    return NextResponse.json({ ok: true });
  }
}
