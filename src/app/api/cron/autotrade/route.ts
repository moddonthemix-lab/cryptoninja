export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import {
  getUserState, getUserStateDex, getFrontendOpenOrders,
  buildOrderAction, buildSetLeverageAction, buildPositionTpSlAction, buildCancelAction,
} from "@/lib/hyperliquid";
import { submitWithAgent, isAgentConfigured } from "@/lib/hl-agent";
import { lockTarget } from "@/lib/trailing";
import { botState, recordServerTrade, serverTradesToday } from "@/lib/botState";

// If an open browser pinged within this window, the in-browser bot is handling
// things — the cron stands down so the two never trade at once.
const HEARTBEAT_TTL_MS = 3 * 60_000;

// ── Server-side auto-trader loop ────────────────────────────────────────────
// Hit this every ~1 min by a scheduler (Railway cron or cron-job.org) so the bot
// scans + trades + trails 24/7, independent of any open browser.
//
// Required env:
//   CRON_SECRET            shared secret (sent as ?secret= or x-cron-secret header)
//   CRON_TRADING_ENABLED   "true" to actually trade (kill switch)
//   HL_AGENT_PRIVATE_KEY   agent wallet key (already used by manual/live trading)
//   HL_MASTER_ADDRESS      your main wallet
// Optional env:
//   CRON_ASSETS            comma list to scan (default BTC,ETH,SOL,HYPE,XRP)
//   CRON_LEVERAGE          default 3
//   CRON_MIN_CONFIDENCE    default 60

const MAX_TRADES = 5;
const COOLDOWN_MS = 30 * 60_000;

async function tg(origin: string, msg: string) {
  try {
    await fetch(`${origin}/api/telegram/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
  } catch { /* best effort */ }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = req.headers.get("x-cron-secret") || url.searchParams.get("secret");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.CRON_TRADING_ENABLED !== "true") return NextResponse.json({ disabled: true, note: "Set CRON_TRADING_ENABLED=true to trade" });
  if (!isAgentConfigured()) return NextResponse.json({ error: "HL_AGENT_PRIVATE_KEY not set" }, { status: 400 });
  const master = process.env.HL_MASTER_ADDRESS;
  if (!master) return NextResponse.json({ error: "HL_MASTER_ADDRESS not set" }, { status: 400 });

  // Hand-off: if a browser is open and trading, stand down (unless overridden).
  const sinceHeartbeat = Date.now() - botState.lastHeartbeat;
  if (process.env.CRON_ALWAYS !== "true" && botState.lastHeartbeat && sinceHeartbeat < HEARTBEAT_TTL_MS) {
    return NextResponse.json({ deferred: true, reason: "browser active — in-app bot handling", sinceHeartbeatSec: Math.round(sinceHeartbeat / 1000) });
  }

  const origin = `${url.protocol}//${url.host}`;
  const leverage = parseInt(process.env.CRON_LEVERAGE || "3", 10);
  const minConf = parseInt(process.env.CRON_MIN_CONFIDENCE || "60", 10);
  const watch = (process.env.CRON_ASSETS || "BTC").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const log: string[] = [];

  try {
    const meta = await (await fetch(`${origin}/api/hl/meta`)).json();
    const metaByCoin: Record<string, any> = {};
    Object.values(meta as Record<string, any>).forEach((m: any) => { metaByCoin[m.hlCoin] = m; });

    // ── Current positions (main + xyz dex) ──
    const [main, xyz] = await Promise.all([getUserState(master), getUserStateDex(master, "xyz").catch(() => null)]);
    const openByCoin: Record<string, { szi: number; entryPx: number; lev: number; upnl: number }> = {};
    const collect = (st: any, dex: "" | "xyz") => ((st?.assetPositions) || []).forEach((ap: any) => {
      const p = ap.position; const szi = parseFloat(p.szi); if (!szi) return;
      const coin = dex === "xyz" && !String(p.coin).startsWith("xyz:") ? `xyz:${p.coin}` : p.coin;
      openByCoin[coin] = { szi, entryPx: parseFloat(p.entryPx), lev: p.leverage?.value ?? leverage, upnl: parseFloat(p.unrealizedPnl || "0") };
    });
    collect(main, ""); collect(xyz, "xyz");

    const cms: any = (main as any)?.crossMarginSummary;
    const accountValue = parseFloat(cms?.accountValue || "0") || 0;
    const marginUsed = parseFloat(cms?.totalMarginUsed || "0") || 0;
    const available = Math.max(accountValue - marginUsed, parseFloat((main as any)?.withdrawable || "0") || 0);

    // ── Trailing-stop management on open positions ──
    const openOrders = await getFrontendOpenOrders(master).catch(() => []);
    for (const [coin, pos] of Object.entries(openByCoin)) {
      const info = metaByCoin[coin]; if (!info) continue;
      const isLong = pos.szi > 0;
      const margin = (Math.abs(pos.szi) * pos.entryPx) / (pos.lev || leverage);
      const pnlPct = margin > 0 ? (pos.upnl / margin) * 100 : 0;
      const t = botState.trail[coin] || { peakPnl: pnlPct, locked: 0 };
      if (pnlPct > t.peakPnl) t.peakPnl = pnlPct;
      const target = lockTarget(pnlPct);
      if (target > t.locked) {
        t.locked = target;
        const lockPx = isLong
          ? pos.entryPx * (1 + target / 100 / (pos.lev || leverage))
          : pos.entryPx * (1 - target / 100 / (pos.lev || leverage));
        const oldSl = (openOrders as any[]).find((o) => o.coin === coin && /stop/i.test(o.orderType || ""));
        if (oldSl) await submitWithAgent(buildCancelAction(info.assetId, oldSl.oid), master).catch(() => {});
        await submitWithAgent(buildPositionTpSlAction(info.assetId, isLong, Math.abs(pos.szi), null, lockPx, info.szDecimals), master).catch(() => {});
        log.push(`Trail ${coin} SL → +${target}% @ ${lockPx.toFixed(4)}`);
        await tg(origin, `🔒 Trail ${coin}: stop moved to lock +${target}% profit`);
      }
      botState.trail[coin] = t;
    }
    for (const coin of Object.keys(botState.trail)) if (!openByCoin[coin]) delete botState.trail[coin];

    // ── New entries (one per tick, respecting cap + cooldown) ──
    let traded = 0;
    const sinceLast = Date.now() - botState.lastTradeTs;
    const canTrade = serverTradesToday() < MAX_TRADES && (!botState.lastTradeTs || sinceLast >= COOLDOWN_MS);

    if (canTrade && available > 0) {
      for (const asset of watch) {
        const info = meta[asset]; if (!info) continue;
        if (openByCoin[info.hlCoin]) continue; // already in a position on this asset

        const aRes = await fetch(`${origin}/api/ai/autotrade`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset, leverage, minConfidence: minConf }),
        });
        const data = await aRes.json();
        if (!data.shouldTrade || (data.confidence ?? 0) < minConf) continue;

        const { direction, entry, sl, tp, confidence, reasoning } = data;
        const riskPct = 0.30 + Math.min(1, Math.max(0, (confidence - minConf) / (100 - minConf))) * 0.20;
        let notional = available * riskPct * leverage;
        if (notional < 10 && available * leverage >= 10) notional = 10;
        if (notional <= 0) continue;
        const size = notional / entry;
        const isBuy = direction === "long";

        await submitWithAgent(buildSetLeverageAction(info.assetId, Math.min(leverage, info.maxLeverage), true), master).catch(() => {});
        const limitPx = isBuy ? entry * 1.01 : entry * 0.99;
        const od: any = await submitWithAgent(buildOrderAction(info.assetId, isBuy, limitPx, size, false, "Ioc", info.szDecimals), master);
        if (od?.status !== "ok") { log.push(`${asset} order failed: ${od?.response ?? od?.error ?? "unknown"}`); continue; }

        await submitWithAgent(buildPositionTpSlAction(info.assetId, isBuy, size, tp, sl, info.szDecimals), master).catch(() => {});
        recordServerTrade();
        botState.trail[info.hlCoin] = { peakPnl: 0, locked: 0 };
        traded++;
        log.push(`ENTER ${direction} ${asset} @ ${entry} conf ${confidence}%`);
        await tg(origin,
          `${isBuy ? "🟩" : "🟥"} <b>SERVER ENTRY</b> · ${direction.toUpperCase()} <b>${asset}</b> ${leverage}x @ $${(+entry).toFixed(4)}\n` +
          `SL $${(+sl).toFixed(4)}  TP $${(+tp).toFixed(4)} · conf ${confidence}%\n${reasoning || ""}`);
        break; // one entry per tick
      }
    }

    return NextResponse.json({
      ok: true, openPositions: Object.keys(openByCoin).length,
      tradesToday: serverTradesToday(), available: +available.toFixed(2), traded, log,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 });
  }
}
