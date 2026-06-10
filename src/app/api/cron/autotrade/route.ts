export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import {
  getUserState, getUserStateDex, getFrontendOpenOrders, getUserFills,
  buildOrderAction, buildSetLeverageAction, buildPositionTpSlAction, buildCancelAction,
} from "@/lib/hyperliquid";
import { submitWithAgent, isAgentConfigured } from "@/lib/hl-agent";
import { lockTarget } from "@/lib/trailing";
import { botState, recordServerTrade, serverTradesToday, mergedFeatureStats } from "@/lib/botState";

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
  const minConf = parseInt(process.env.CRON_MIN_CONFIDENCE || "65", 10);
  const watch = (process.env.CRON_ASSETS || "BTC").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const log: string[] = [];

  try {
    const meta = await (await fetch(`${origin}/api/hl/meta`)).json();
    const metaByCoin: Record<string, any> = {};
    Object.values(meta as Record<string, any>).forEach((m: any) => { metaByCoin[m.hlCoin] = m; });

    // ── Current positions (main + xyz dex) ──
    const [main, xyz] = await Promise.all([getUserState(master), getUserStateDex(master, "xyz").catch(() => null)]);
    const openByCoin: Record<string, { szi: number; entryPx: number; lev: number; upnl: number; mark: number }> = {};
    const collect = (st: any, dex: "" | "xyz") => ((st?.assetPositions) || []).forEach((ap: any) => {
      const p = ap.position; const szi = parseFloat(p.szi); if (!szi) return;
      const coin = dex === "xyz" && !String(p.coin).startsWith("xyz:") ? `xyz:${p.coin}` : p.coin;
      const posVal = parseFloat(p.positionValue || "0") || 0;
      const mark = posVal > 0 && Math.abs(szi) > 0 ? posVal / Math.abs(szi) : parseFloat(p.entryPx);
      openByCoin[coin] = { szi, entryPx: parseFloat(p.entryPx), lev: p.leverage?.value ?? leverage, upnl: parseFloat(p.unrealizedPnl || "0"), mark };
    });
    collect(main, ""); collect(xyz, "xyz");

    // ── Exit alerts: detect positions that closed since the last cron run ──
    const nowTs = Date.now();
    const gap = nowTs - (botState.lastCronRun || 0);
    botState.lastCronRun = nowTs;
    const curr: Record<string, { szi: number; entryPx: number }> = {};
    for (const [coin, p] of Object.entries(openByCoin)) curr[coin] = { szi: p.szi, entryPx: p.entryPx };
    if (gap < 5 * 60_000) {
      const closedCoins = Object.keys(botState.lastOpen).filter((c) => !curr[c]);
      if (closedCoins.length) {
        const fills = await getUserFills(master).catch(() => []);
        const since = nowTs - 20 * 60_000;
        for (const coin of closedCoins) {
          const sym = coin.replace(/^xyz:/, "");
          let pnl = 0;
          for (const f of (fills as any[])) {
            if ((f.time ?? 0) < since) continue;
            if (String(f.coin).replace(/^xyz:/, "") !== sym) continue;
            const cp = parseFloat(f.closedPnl ?? "0") || 0;
            if (cp !== 0) pnl += cp - (parseFloat(f.fee ?? "0") || 0);
          }
          // Credit this trade's features into the server's learning stats
          const feats = botState.pendingFeatures[coin];
          if (feats) {
            const win = pnl > 0;
            for (const f of feats) { (botState.serverFeatureStats[f] ||= { w: 0, l: 0 }); if (win) botState.serverFeatureStats[f].w++; else botState.serverFeatureStats[f].l++; }
            delete botState.pendingFeatures[coin];
          }
          log.push(`Exit ${sym} PnL ${pnl.toFixed(2)}`);
          await tg(origin, `${pnl >= 0 ? "🟢" : "🔴"} <b>${pnl >= 0 ? "TP / EXIT" : "SL / EXIT"} ${sym}</b>\nClosed · PnL <b>${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toFixed(2)}</b>`);
        }
      }
    }
    botState.lastOpen = curr;

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
          body: JSON.stringify({ asset, leverage, minConfidence: minConf, featureStats: mergedFeatureStats() }),
        });
        const data = await aRes.json();
        if (!data.shouldTrade || (data.confidence ?? 0) < minConf) continue;

        const { direction, entry, sl, tp, confidence, reasoning } = data;
        const lev = Math.max(1, Math.min(data.leverage ?? leverage, leverage)); // leverage-aware (structural stop)
        const riskPct = 0.30 + Math.min(1, Math.max(0, (confidence - minConf) / (100 - minConf))) * 0.20;
        let notional = available * riskPct * lev;
        if (notional < 10 && available * lev >= 10) notional = 10;
        if (notional <= 0) continue;
        const size = notional / entry;
        const isBuy = direction === "long";

        await submitWithAgent(buildSetLeverageAction(info.assetId, Math.min(lev, info.maxLeverage), info.dex !== "xyz"), master).catch(() => {});
        const limitPx = isBuy ? entry * 1.01 : entry * 0.99;
        const od: any = await submitWithAgent(buildOrderAction(info.assetId, isBuy, limitPx, size, false, "Ioc", info.szDecimals), master);
        const fillSt = od?.response?.data?.statuses?.[0];
        if (od?.status !== "ok" || fillSt?.error || !fillSt?.filled) {
          log.push(`${asset} order not filled: ${fillSt?.error ?? od?.response ?? od?.error ?? "no fill"}`);
          continue;
        }

        await submitWithAgent(buildPositionTpSlAction(info.assetId, isBuy, size, tp, sl, info.szDecimals), master).catch(() => {});
        recordServerTrade();
        botState.trail[info.hlCoin] = { peakPnl: 0, locked: 0 };
        if (Array.isArray(data.features)) botState.pendingFeatures[info.hlCoin] = data.features; // for learning credit on close
        traded++;
        log.push(`ENTER ${direction} ${asset} @ ${entry} conf ${confidence}%`);
        await tg(origin,
          `${isBuy ? "🟩" : "🟥"} <b>SERVER ENTRY</b> · ${direction.toUpperCase()} <b>${asset}</b> ${lev}x @ $${(+entry).toFixed(4)}\n` +
          `SL $${(+sl).toFixed(4)}  TP $${(+tp).toFixed(4)} · conf ${confidence}%\n${reasoning || ""}`);
        break; // one entry per tick
      }
    }

    // ── Copy trading: mirror a target wallet 24/7 (config synced from browser) ──
    const cc = botState.copyConfig;
    let copyActions = 0;
    if (cc?.enabled && /^0x[0-9a-fA-F]{40}$/.test(String(cc.targetAddress || ""))) {
      const symOf = (coin: string) => coin.replace(/^xyz:/, "");
      const metaByCoin: Record<string, any> = {};
      Object.values(meta as Record<string, any>).forEach((m: any) => { metaByCoin[m.hlCoin] = m; });
      try {
        const td = await (await fetch(`${origin}/api/hl/trader?address=${cc.targetAddress}`)).json();
        const tPositions: any[] = td.positions || [];
        const tEquity: number = td.accountValue || 0;
        const targetCoins = new Set<string>(tPositions.map((p) => p.coin));

        // Opens — copy target positions we don't already hold
        for (const tp of tPositions) {
          const sym = symOf(tp.coin); const info = meta[sym]; if (!info) continue;
          if (Array.isArray(cc.assetFilter) && cc.assetFilter.length && !cc.assetFilter.includes(sym)) continue;
          if (tp.direction === "long" && cc.copyLongs === false) continue;
          if (tp.direction === "short" && cc.copyShorts === false) continue;
          const coin = info.hlCoin;
          if (openByCoin[coin]) { botState.copyOpen[coin] = true; continue; }

          const lev = Math.max(1, Math.min(tp.leverage || cc.leverageCap || leverage, cc.leverageCap || leverage));
          const price = tp.size > 0 ? tp.positionValue / tp.size : tp.entryPx;
          if (!price) continue;
          let marginUsd: number;
          if (cc.sizingMode === "fixed") marginUsd = cc.fixedUsd || 10;
          else if (cc.sizingMode === "multiplier") marginUsd = (tp.positionValue * (cc.multiplier || 1)) / lev;
          else { const w = tEquity > 0 ? tp.positionValue / tEquity : 0; marginUsd = (w * accountValue) / lev; }
          marginUsd = Math.min(marginUsd, cc.maxMarginPerTrade || 1e9, available);
          let notional = marginUsd * lev;
          if (notional < 10 && available * lev >= 10) notional = 10;
          if (notional <= 0) continue;
          const size = notional / price;
          const isBuy = tp.direction === "long";
          const sl = isBuy ? price * (1 - 0.23 / lev) : price * (1 + 0.23 / lev);
          const tpx = isBuy ? price * (1 + 0.30 / lev) : price * (1 - 0.30 / lev);
          await submitWithAgent(buildSetLeverageAction(info.assetId, Math.min(lev, info.maxLeverage), info.dex !== "xyz"), master).catch(() => {});
          const od: any = await submitWithAgent(buildOrderAction(info.assetId, isBuy, isBuy ? price * 1.01 : price * 0.99, size, false, "Ioc", info.szDecimals), master);
          if (od?.status === "ok") {
            await submitWithAgent(buildPositionTpSlAction(info.assetId, isBuy, size, tpx, sl, info.szDecimals), master).catch(() => {});
            botState.copyOpen[coin] = true; copyActions++;
            log.push(`COPY OPEN ${sym}`);
            await tg(origin, `👥 <b>COPY OPEN</b> ${tp.direction.toUpperCase()} <b>${sym}</b> ${lev}x @ $${price.toFixed(4)}`);
          }
        }

        // Closes — target exited a position we copied → close ours
        for (const coin of Object.keys(botState.copyOpen)) {
          if (targetCoins.has(coin)) continue;
          const pos = openByCoin[coin];
          if (!pos) { delete botState.copyOpen[coin]; continue; }
          const info = metaByCoin[coin]; if (!info) continue;
          const isLong = pos.szi > 0; const closeBuy = !isLong;
          const limitPx = closeBuy ? pos.mark * 1.03 : pos.mark * 0.97;
          const od: any = await submitWithAgent(buildOrderAction(info.assetId, closeBuy, limitPx, Math.abs(pos.szi), true, "Ioc", info.szDecimals), master);
          if (od?.status === "ok") {
            delete botState.copyOpen[coin]; copyActions++;
            log.push(`COPY CLOSE ${symOf(coin)}`);
            await tg(origin, `👥 <b>COPY CLOSE</b> ${symOf(coin)} — target exited · PnL ${pos.upnl >= 0 ? "+" : "-"}$${Math.abs(pos.upnl).toFixed(2)}`);
          }
        }
      } catch (e: any) {
        log.push(`copy error: ${e.message}`);
      }
    }

    return NextResponse.json({
      ok: true, openPositions: Object.keys(openByCoin).length,
      tradesToday: serverTradesToday(), available: +available.toFixed(2), traded, copyActions, log,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, log }, { status: 500 });
  }
}
