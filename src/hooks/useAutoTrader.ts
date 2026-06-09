"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { priceToWire, sizeToWire } from "@/lib/hyperliquid";
import { ASSETS } from "@/types";
import { notify } from "@/lib/notify";
import { lockTarget, trailMeta } from "@/lib/trailing";
import type { Asset } from "@/types";

// Start of the user's LOCAL day, in ms
function localDayStart(): number { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

// Correct "today's total" realized PnL: live → Hyperliquid fills since local
// midnight (net of fees); paper → store trades closed since local midnight.
async function realizedToday(live: boolean): Promise<number> {
  const start = localDayStart();
  if (live) {
    try {
      const d = await (await fetch(`/api/hl/today?since=${start}`)).json();
      return typeof d.realized === "number" ? d.realized : 0;
    } catch { return 0; }
  }
  return useStore.getState().closedTrades
    .filter((t) => t.closedAt && new Date(t.closedAt).getTime() >= start)
    .reduce((s, t) => s + (t.pnl ?? 0), 0);
}
const fmt = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;

const SCAN_INTERVAL_MS = 60 * 1000;      // 1 min between scans
const PRICE_POLL_MS = 10 * 1000;         // 10 s price check

export interface ConfidenceFactor { label: string; points: number; active: boolean }

export interface AutoTraderStatus {
  state: "idle" | "scanning" | "in_position" | "error";
  lastSignal: string | null;
  lastScanTime: string | null;
  currentPnlPct: number | null;
  peakPnlPct: number | null;
  trailActive: boolean;
  lockedPct: number;        // profit % currently locked by the trailing stop
  lastConfidence: number | null;
  lastBreakdown: ConfidenceFactor[] | null;
  lastBreakdownDir: "long" | "short" | null;
  log: Array<{ time: string; msg: string; type: "info" | "trade" | "sl" | "tp" | "trail" | "error" }>;
}


const MAX_TRADES_PER_DAY = 5;
const TRADE_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between auto trades
const MIN_CONFIDENCE = 65;                 // only take 65%+ confidence setups

export function useAutoTrader(asset: Asset) {
  const {
    autoTradeEnabled, autoTradeLeverage, emergencyStop,
    openPosition, closePosition, openPositions,
    paperBalance, tradingMode,
  } = useStore();

  const hl = useHyperliquid();

  const [status, setStatus] = useState<AutoTraderStatus>({
    state: "idle",
    lastSignal: null,
    lastScanTime: null,
    currentPnlPct: null,
    peakPnlPct: null,
    trailActive: false,
    lockedPct: 0,
    lastConfidence: null,
    lastBreakdown: null,
    lastBreakdownDir: null,
    log: [],
  });

  const scanningRef = useRef(false);
  // Keep latest hl methods accessible inside the always-on monitor closure
  const hlRef = useRef(hl);
  hlRef.current = hl;

  // Reset on asset change so stale error/scan state doesn't carry over
  useEffect(() => {
    scanningRef.current = false;
    setStatus((s) => ({
      ...s, state: "idle", lastSignal: null,
      currentPnlPct: null, peakPnlPct: null, trailActive: false,
    }));
  }, [asset]);

  const addLog = useCallback((msg: string, type: AutoTraderStatus["log"][0]["type"] = "info") => {
    setStatus((s) => ({
      ...s,
      log: [{ time: new Date().toLocaleTimeString(), msg, type }, ...s.log].slice(0, 60),
    }));
  }, []);

  // ── ALWAYS-ON price monitor ──────────────────────────────────────────────
  // Runs every 10 s regardless of autoTradeEnabled so SL/TP fire even
  // when the bot is toggled off or a different asset is selected.
  // Checks ALL open positions across ALL assets.
  useEffect(() => {
    const monitor = () => {
      const allPositions = useStore.getState().openPositions.filter((p) => p.isOpen);
      if (allPositions.length === 0) return;

      const md = useStore.getState().marketData;
      const liveMode = useStore.getState().tradingMode === "live";

      // Close the real HL position (reduce-only) — safe even if HL already
      // closed it via its own TP/SL trigger.
      const closeLive = (pos: typeof allPositions[number], price: number) => {
        if (!liveMode) return;
        hlRef.current
          .closeLivePosition({ asset: pos.asset as Asset, direction: pos.direction as "long" | "short", size: pos.size, currentPrice: price })
          .catch(() => { /* position may already be flat */ });
      };

      // Move the live SL trigger up to a new (in-profit) price: cancel the old
      // stop for this coin, then place a fresh SL trigger at the locked price.
      const moveLiveStop = async (pos: typeof allPositions[number], newSlPx: number) => {
        try {
          const hlNow = hlRef.current;
          const coin = ASSETS[pos.asset]?.hlCoin ?? pos.asset;
          const oldStop = (hlNow.openOrders || []).find(
            (o: any) => o.coin === coin && /stop/i.test(o.orderType || "")
          );
          if (oldStop) await hlNow.cancelOrderByCoin(coin, oldStop.oid);
          await hlNow.setTpSl({
            asset: pos.asset as Asset,
            positionIsLong: pos.direction === "long",
            size: pos.size,
            stopLoss: newSlPx,
          });
        } catch { /* best effort — app-side close still protects the lock */ }
      };

      // Telegram alert on exit. Fetch today's total AFTER the close settles so
      // the figure is correct (live: HL fills; paper: store).
      const alertExit = (pos: typeof allPositions[number], price: number, reason: "TP" | "SL" | "TRAIL", pnlPct: number) => {
        const margin = (pos.size * pos.entryPrice) / pos.leverage;
        const pnlUsd = margin * (pnlPct / 100);
        const emoji = reason === "SL" ? "🔴" : "🟢";
        // give the fill ~1.5s to land in HL's history, then read the real total
        setTimeout(() => {
          realizedToday(liveMode).then((daily) => {
            notify(
              `${emoji} <b>${reason} EXIT</b> · ${liveMode ? "LIVE" : "PAPER"}\n` +
              `${pos.direction.toUpperCase()} <b>${pos.asset}</b> closed @ $${price.toFixed(4)}\n` +
              `Trade PnL: <b>${fmt(pnlUsd)}</b> (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)\n` +
              `Today's total: <b>${fmt(daily)}</b>`
            );
          });
        }, 1500);
      };

      for (const pos of allPositions) {
        const price = md[pos.asset as Asset]?.price;
        if (!price) continue;

        const direction = pos.direction as "long" | "short";
        const priceDiff = direction === "long" ? price - pos.entryPrice : pos.entryPrice - price;
        const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
        const meta = trailMeta[pos.id];
        const isCurrentAsset = pos.asset === asset;

        // ── Hard SL: -23% of margin ──
        if (pnlPct <= -23) {
          closeLive(pos, price);
          closePosition(pos.id, price, "sl");
          alertExit(pos, price, "SL", pnlPct);
          if (meta) delete trailMeta[pos.id];
          addLog(`SL hit on ${pos.asset} @ $${price.toFixed(2)} (−23% margin)`, "sl");
          if (isCurrentAsset) {
            setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
          }
          continue; // check remaining positions
        }

        // ── Hard TP: hit the target price (skip if no TP set, e.g. copy trades) ──
        const tpHit = pos.takeProfit > 0 && (direction === "long" ? price >= pos.takeProfit : price <= pos.takeProfit);
        if (tpHit) {
          closeLive(pos, price);
          closePosition(pos.id, price, "tp");
          alertExit(pos, price, "TP", pnlPct);
          if (meta) delete trailMeta[pos.id];
          addLog(`TP hit on ${pos.asset} @ $${price.toFixed(2)} (+${pnlPct.toFixed(1)}% margin)`, "tp");
          if (isCurrentAsset) {
            setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
          }
          continue;
        }

        // ── Trailing stop runs for EVERY position; only the status panel is
        //    scoped to the currently-selected asset. ──
        if (meta) {
          // Track peak (for display)
          const currentPeakPnl = direction === "long"
            ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice * 100 * meta.leverage
            : (pos.entryPrice - meta.peakPrice) / pos.entryPrice * 100 * meta.leverage;
          if (pnlPct > currentPeakPnl) meta.peakPrice = price;
          const peakPnlPct = direction === "long"
            ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice * 100 * meta.leverage
            : (pos.entryPrice - meta.peakPrice) / pos.entryPrice * 100 * meta.leverage;

          // ── Ratchet the locked profit level up as profit grows ──
          const target = lockTarget(pnlPct);
          if (target > meta.lockedPct) {
            meta.lockedPct = target;
            // price that corresponds to the locked profit %
            const lockPx = direction === "long"
              ? pos.entryPrice * (1 + target / 100 / pos.leverage)
              : pos.entryPrice * (1 - target / 100 / pos.leverage);
            // Update the stored stop so the chart line + persisted SL reflect it
            useStore.getState().updatePositionStop(pos.id, lockPx);
            addLog(`Trail: SL → +${target}% profit on ${pos.asset} ($${lockPx.toFixed(2)}) as trade hit +${pnlPct.toFixed(0)}%`, "trail");
            // Live: move the actual SL trigger on Hyperliquid (server-enforced)
            if (liveMode) moveLiveStop(pos, lockPx);
          }

          if (isCurrentAsset) {
            setStatus((s) => ({ ...s, state: "in_position", currentPnlPct: pnlPct, peakPnlPct, trailActive: meta.lockedPct > 0, lockedPct: meta.lockedPct }));
          }

          // Close if price retraces back to the locked profit level
          if (meta.lockedPct > 0 && pnlPct <= meta.lockedPct) {
            closeLive(pos, price);
            closePosition(pos.id, price, "tp");
            alertExit(pos, price, "TRAIL", pnlPct);
            delete trailMeta[pos.id];
            addLog(`Trail stop on ${pos.asset} @ $${price.toFixed(2)} — locked in +${meta.lockedPct}% profit`, "trail");
            if (isCurrentAsset) {
              setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false, lockedPct: 0 }));
            }
          }
        } else if (isCurrentAsset) {
          setStatus((s) => ({
            ...s,
            state: "in_position",
            currentPnlPct: pnlPct,
            peakPnlPct: Math.max(s.peakPnlPct ?? 0, pnlPct),
            trailActive: false,
          }));
        }
      }
    };

    const timer = setInterval(monitor, PRICE_POLL_MS);
    monitor(); // run immediately on mount / asset change
    return () => clearInterval(timer);
    // closePosition and addLog are stable refs; asset used for status routing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, closePosition, addLog]);

  // ── Noon daily report (once per day, while the app is open) ──────────────
  useEffect(() => {
    const check = () => {
      const now = new Date();
      if (now.getHours() < 12) return; // only at/after local noon
      const today = now.toISOString().slice(0, 10);
      if (localStorage.getItem("cn_daily_report") === today) return;
      localStorage.setItem("cn_daily_report", today);

      const equity = hlRef.current.totalBalance || 0;
      const openCount = useStore.getState().openPositions.filter((p) => p.isOpen).length;
      const live = useStore.getState().tradingMode === "live";
      realizedToday(live).then((daily) => {
        notify(
          `📊 <b>Daily Report</b> — ${today}\n` +
          (live && equity > 0 ? `Account equity: <b>$${equity.toFixed(2)}</b>\n` : "") +
          `Realized today: <b>${fmt(daily)}</b>\n` +
          `Open positions: ${openCount}`
        );
      });
    };
    const id = setInterval(check, 60_000);
    check();
    return () => clearInterval(id);
  }, []);

  // ── Scanner: rule-based signal every scan; AI + trade only when enabled ──
  const runScan = useCallback(async () => {
    if (scanningRef.current || emergencyStop) return;

    const store = useStore.getState();
    // Preview mode: when the bot is OFF, still scan to SHOW the signal/confidence
    // (rule-based only — no AI, no credits, no trade).
    const preview = !store.autoTradeEnabled;

    if (!preview) {
      // ── Daily trade cap — stop calling the API entirely once hit ──
      const tradesToday = store.getTradesToday();
      if (tradesToday >= MAX_TRADES_PER_DAY) {
        setStatus((s) => ({ ...s, state: "idle", lastSignal: `Daily limit reached (${MAX_TRADES_PER_DAY} trades). Resets at midnight, or tap reset.` }));
        return;
      }

      // ── Cooldown between trades — avoids spamming the API ──
      const sinceLast = Date.now() - (store.autoTradeLastTs || 0);
      if (store.autoTradeLastTs && sinceLast < TRADE_COOLDOWN_MS) {
        const mins = Math.ceil((TRADE_COOLDOWN_MS - sinceLast) / 60000);
        setStatus((s) => ({ ...s, state: "idle", lastSignal: `Cooldown — next scan in ~${mins} min` }));
        return;
      }

      // One position per asset at a time (don't re-scan/charge while in a trade)
      const openCount = store.openPositions.filter((p) => p.isOpen && p.asset === asset).length;
      if (openCount >= 1) return;
    }

    scanningRef.current = true;
    setStatus((s) => ({ ...s, state: "scanning", lastScanTime: new Date().toLocaleTimeString() }));

    try {
      // Feed recent trade outcomes back to the AI when learning is enabled
      const learnOn = useStore.getState().learningEnabled;
      const recentTrades = learnOn
        ? store.closedTrades.slice(0, 8).map((t) => ({
            asset: t.asset, direction: t.direction,
            confidence: t.confidence, pnlPct: t.pnlPercent, note: t.note,
          }))
        : [];
      // Per-setup win rates from our own closed trades, for the learning nudge
      const featureStats: Record<string, { w: number; l: number }> = {};
      if (learnOn) {
        for (const t of store.closedTrades) {
          if (!t.features || t.pnl == null) continue;
          const win = (t.pnl ?? 0) > 0;
          for (const f of t.features) { (featureStats[f] ||= { w: 0, l: 0 }); if (win) featureStats[f].w++; else featureStats[f].l++; }
        }
      }
      const res = await fetch("/api/ai/autotrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset, leverage: autoTradeLeverage,
          minConfidence: MIN_CONFIDENCE,
          learn: !preview && learnOn,
          recentTrades: preview ? [] : recentTrades,
          featureStats: preview ? {} : featureStats,
          // AI only when the toggle is on AND we're actually trading (not preview)
          useAI: !preview && useStore.getState().botUseAI,
          preview,
        }),
      });
      const data = await res.json();

      if (data.error) {
        if (!preview) { addLog(`Scan error: ${data.error}`, "error"); setStatus((s) => ({ ...s, state: "error", lastSignal: data.error })); }
        return;
      }

      // Capture the confidence breakdown whenever a signal was scored
      if (data.confidenceBreakdown) {
        setStatus((s) => ({
          ...s,
          lastBreakdown: data.confidenceBreakdown,
          lastConfidence: data.confidence ?? null,
          lastBreakdownDir: data.direction ?? null,
        }));
      }

      // Preview mode: just show the signal, never trade
      if (preview) {
        const dir = data.direction ? data.direction.toUpperCase() : "";
        setStatus((s) => ({ ...s, state: "idle", lastSignal: data.shouldTrade && data.confidence >= MIN_CONFIDENCE
          ? `Signal: ${dir} ${data.confidence}% (bot off)` : (data.reason ?? `Watching — ${data.confidence ?? 0}%`) }));
        return;
      }

      if (!data.shouldTrade) {
        const reason = data.reason ?? "No signal";
        addLog(`No trade: ${reason}`, "info");
        setStatus((s) => ({ ...s, state: "idle", lastSignal: reason }));
        return;
      }

      // Confidence filter — only take high-conviction setups
      if ((data.confidence ?? 0) < MIN_CONFIDENCE) {
        addLog(`Skipped: confidence ${data.confidence ?? 0}% < ${MIN_CONFIDENCE}% minimum`, "info");
        setStatus((s) => ({ ...s, state: "idle", lastSignal: `Low confidence (${data.confidence ?? 0}%)` }));
        return;
      }

      // ── Final safety gates (re-read fresh state right before committing) ──
      const gate = useStore.getState();
      if (!gate.autoTradeEnabled) {            // bot was turned off mid-scan
        setStatus((s) => ({ ...s, state: "idle" }));
        return;
      }

      const { direction, confidence, entry, tp, tpPct, reasoning,
        trailTriggerPct = 20, trailRetreatPct = 35 } = data;
      let { sl } = data;

      addLog(
        `Signal: ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | conf ${confidence}% | TP ${tpPct}% margin`,
        "trade"
      );

      // ── Risk sizing: use 30–50% of available funds as margin, scaled by
      //    confidence (60% → 30%, 100% → 50%) ──
      const riskPct = 0.30 + Math.min(1, Math.max(0, (confidence - MIN_CONFIDENCE) / (100 - MIN_CONFIDENCE))) * 0.20;
      // Read real buying power straight from the account endpoint (the hook's
      // state may not be loaded in this component → false $0).
      let available: number;
      if (tradingMode === "live") {
        try {
          const acc = await (await fetch("/api/hl/account")).json();
          const cms = acc?.state?.crossMarginSummary;
          const av = parseFloat(cms?.accountValue ?? "0") || 0;
          const mu = parseFloat(cms?.totalMarginUsed ?? "0") || 0;
          const wd = parseFloat(acc?.state?.withdrawable ?? "0") || 0;
          const spot = acc?.spotUsdcBalance || 0;
          available = Math.max(av - mu, wd, spot, hl.availableBalance || 0);
        } catch { available = hl.availableBalance || 0; }
      } else {
        available = useStore.getState().paperBalance;
      }
      // ── Protect gains: once today's profit ≥ 25% of the account, tighten the
      //    stop (−23% → −12% margin) so we give less back to the market. ──
      const dayGain = await realizedToday(tradingMode === "live");
      const equityNow = tradingMode === "live" ? (hl.totalBalance || available) : useStore.getState().paperBalance;
      if (equityNow > 0 && dayGain / equityNow >= 0.25) {
        const tightPct = 12 / 100 / autoTradeLeverage;
        sl = direction === "long" ? entry * (1 - tightPct) : entry * (1 + tightPct);
        addLog(`Up +${((dayGain / equityNow) * 100).toFixed(0)}% today — tightening SL to −12% to protect gains`, "info");
      }

      const marginToUse = available * riskPct;
      let positionUsd = marginToUse * autoTradeLeverage; // notional
      // Honor Hyperliquid's $10 minimum order when there's margin to support it
      if (tradingMode === "live" && positionUsd < 10 && available * autoTradeLeverage >= 10) positionUsd = 10;
      const size = positionUsd / entry;
      const posId = `auto_${Date.now()}`;

      if (available <= 0 || positionUsd <= 0) {
        addLog(`No available funds to size a trade (free $${available.toFixed(2)})`, "error");
        setStatus((s) => ({ ...s, state: "idle" }));
        return;
      }
      addLog(`Risk: using ${(riskPct * 100).toFixed(0)}% of $${available.toFixed(2)} = $${marginToUse.toFixed(2)} margin → $${positionUsd.toFixed(2)} notional`, "info");

      // Live mode: submit real order via agent-key proxy (no wallet needed)
      if (tradingMode === "live") {
        try {
          // Fetch asset index for leverage + order actions
          const metaRes = await fetch("/api/hl/meta");
          const meta = await metaRes.json();
          const assetInfo = meta[asset];
          if (!assetInfo) throw new Error(`Asset meta not loaded for ${asset}`);

          // 1. Set leverage (xyz dex = stocks/commodities → isolated only)
          const leverageAction = {
            type: "updateLeverage",
            asset: assetInfo.assetId,
            isCross: assetInfo.dex !== "xyz",
            leverage: Math.min(autoTradeLeverage, assetInfo.maxLeverage),
          };
          await fetch("/api/hl/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: leverageAction }),
          });

          // 2. Place market order (1% slippage limit)
          const isBuy = direction === "long";
          const limitPx = isBuy ? entry * 1.01 : entry * 0.99;
          const szDec = assetInfo.szDecimals ?? 2;
          const orderAction = {
            type: "order",
            orders: [{
              a: assetInfo.assetId,
              b: isBuy,
              p: priceToWire(limitPx, szDec),
              s: sizeToWire(positionUsd / entry, szDec),
              r: false,
              t: { limit: { tif: "Ioc" } },
            }],
            grouping: "na",
          };
          const orderRes = await fetch("/api/hl/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: orderAction }),
          });
          const orderData = await orderRes.json();
          if (orderData.error) throw new Error(orderData.error);
          addLog(`Live order submitted to Hyperliquid`, "trade");

          // 3. Attach TP + SL trigger orders on HL (server-enforced, survive app close)
          try {
            await hl.setTpSl({
              asset,
              positionIsLong: direction === "long",
              size: positionUsd / entry,
              takeProfit: tp,
              stopLoss: sl,
            });
            addLog(`TP $${tp.toFixed(2)} + SL $${sl.toFixed(2)} set on Hyperliquid`, "trade");
          } catch (tpErr: any) {
            addLog(`Entry filled but TP/SL failed: ${tpErr.message}`, "error");
          }
        } catch (orderErr: any) {
          addLog(`Live order failed: ${orderErr.message}`, "error");
          setStatus((s) => ({ ...s, state: "error", lastSignal: orderErr.message }));
          return;
        }
      }

      openPosition({
        id: posId, asset, direction,
        entryPrice: entry, currentPrice: entry,
        size, leverage: autoTradeLeverage,
        stopLoss: sl, takeProfit: tp,
        isOpen: true, openedAt: new Date().toISOString(),
        note: reasoning, confidence, features: data.features,
      });

      trailMeta[posId] = { peakPrice: entry, trailTriggerPct, trailRetreatPct, leverage: autoTradeLeverage, direction, lockedPct: 0 };

      // Count this trade toward the daily cap + start the cooldown
      useStore.getState().recordAutoTrade();

      addLog(
        `Opened ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | SL $${sl.toFixed(2)} | TP $${tp.toFixed(2)} | Trail +${trailTriggerPct}% | Trade ${useStore.getState().getTradesToday()}/${MAX_TRADES_PER_DAY} today`,
        "trade"
      );
      setStatus((s) => ({ ...s, state: "in_position", lastSignal: reasoning }));

      // Telegram alert — entry
      const modeTag = tradingMode === "live" ? "🟢 LIVE" : "📄 PAPER";
      notify(
        `${direction === "long" ? "🟩" : "🟥"} <b>ENTRY</b> · ${modeTag}\n` +
        `${direction.toUpperCase()} <b>${asset}</b> ${autoTradeLeverage}x\n` +
        `Entry: $${entry.toFixed(4)}\nSL: $${sl.toFixed(4)}  TP: $${tp.toFixed(4)}\n` +
        `Confidence: ${confidence}%\n${reasoning}`
      );
    } catch (e: any) {
      addLog(`Scan failed: ${e.message}`, "error");
      setStatus((s) => ({ ...s, state: "error" }));
    } finally {
      scanningRef.current = false;
    }
  }, [asset, autoTradeLeverage, emergencyStop, tradingMode, openPosition, addLog, hl.setTpSl, hl.availableBalance]);

  // ── Scan timer: always runs. When the bot is ON it can trade/use AI; when OFF
  //    it scans in preview mode (rule-based only) to show the live signal. ──
  useEffect(() => {
    if (emergencyStop) return;
    runScan(); // immediate first scan
    const timer = setInterval(runScan, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [emergencyStop, runScan]);

  return status;
}
