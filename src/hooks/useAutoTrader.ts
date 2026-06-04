"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { priceToWire, sizeToWire } from "@/lib/hyperliquid";
import type { Asset } from "@/types";

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 min between scans
const PRICE_POLL_MS = 10 * 1000;         // 10 s price check

export interface AutoTraderStatus {
  state: "idle" | "scanning" | "in_position" | "error";
  lastSignal: string | null;
  lastScanTime: string | null;
  currentPnlPct: number | null;
  peakPnlPct: number | null;
  trailActive: boolean;
  log: Array<{ time: string; msg: string; type: "info" | "trade" | "sl" | "tp" | "trail" | "error" }>;
}

// Per-position trailing stop metadata (lives only in memory)
const trailMeta: Record<string, {
  peakPrice: number;
  trailTriggerPct: number;
  trailRetreatPct: number;
  leverage: number;
  direction: "long" | "short";
}> = {};

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

      for (const pos of allPositions) {
        const price = md[pos.asset as Asset]?.price;
        if (!price) continue;

        const direction = pos.direction as "long" | "short";
        const priceDiff = direction === "long" ? price - pos.entryPrice : pos.entryPrice - price;
        const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
        const meta = trailMeta[pos.id];
        const isCurrentAsset = pos.asset === asset;

        // ── Hard SL: -30% of margin ──
        if (pnlPct <= -30) {
          closeLive(pos, price);
          closePosition(pos.id, price, "sl");
          if (meta) delete trailMeta[pos.id];
          addLog(`SL hit on ${pos.asset} @ $${price.toFixed(2)} (−30% margin)`, "sl");
          if (isCurrentAsset) {
            setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
          }
          continue; // check remaining positions
        }

        // ── Hard TP: hit the target price ──
        const tpHit = direction === "long" ? price >= pos.takeProfit : price <= pos.takeProfit;
        if (tpHit) {
          closeLive(pos, price);
          closePosition(pos.id, price, "tp");
          if (meta) delete trailMeta[pos.id];
          addLog(`TP hit on ${pos.asset} @ $${price.toFixed(2)} (+${pnlPct.toFixed(1)}% margin)`, "tp");
          if (isCurrentAsset) {
            setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
          }
          continue;
        }

        // ── Trailing stop + status update (selected asset only) ──
        if (!isCurrentAsset) continue;

        if (meta) {
          // Update peak price
          const currentPeakPnl = direction === "long"
            ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice * 100 * meta.leverage
            : (pos.entryPrice - meta.peakPrice) / pos.entryPrice * 100 * meta.leverage;
          if (pnlPct > currentPeakPnl) meta.peakPrice = price;

          const peakPnlPct = direction === "long"
            ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice * 100 * meta.leverage
            : (pos.entryPrice - meta.peakPrice) / pos.entryPrice * 100 * meta.leverage;

          const trailActive = peakPnlPct >= meta.trailTriggerPct;
          setStatus((s) => ({ ...s, state: "in_position", currentPnlPct: pnlPct, peakPnlPct, trailActive }));

          if (trailActive) {
            const trailStopPnlPct = peakPnlPct * (1 - meta.trailRetreatPct / 100);
            if (pnlPct <= trailStopPnlPct && pnlPct > 0) {
              closeLive(pos, price);
              closePosition(pos.id, price, "tp");
              delete trailMeta[pos.id];
              addLog(
                `Trail stop on ${pos.asset} @ $${price.toFixed(2)} — locked +${pnlPct.toFixed(1)}% (peak +${peakPnlPct.toFixed(1)}%)`,
                "trail"
              );
              setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
            }
          }
        } else {
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

  // ── Scanner: ask Claude/TheStrat every 5 min ────────────────────────────
  const runScan = useCallback(async () => {
    if (scanningRef.current || emergencyStop) return;

    const store = useStore.getState();

    // ── Daily trade cap — stop calling the API entirely once hit ──
    const tradesToday = store.getTradesToday();
    if (tradesToday >= MAX_TRADES_PER_DAY) {
      setStatus((s) => ({ ...s, state: "idle", lastSignal: `Daily limit reached (${MAX_TRADES_PER_DAY} trades). Resets at UTC midnight.` }));
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

    scanningRef.current = true;
    setStatus((s) => ({ ...s, state: "scanning", lastScanTime: new Date().toLocaleTimeString() }));

    try {
      const res = await fetch("/api/ai/autotrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, leverage: autoTradeLeverage }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`Scan error: ${data.error}`, "error");
        setStatus((s) => ({ ...s, state: "error", lastSignal: data.error }));
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

      const { direction, confidence, entry, sl, tp, tpPct, reasoning,
        trailTriggerPct = 20, trailRetreatPct = 35 } = data;

      addLog(
        `Signal: ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | conf ${confidence}% | TP ${tpPct}% margin`,
        "trade"
      );

      const currentBalance = useStore.getState().paperBalance;
      const positionUsd = currentBalance * 0.05;
      const size = positionUsd / entry;
      const posId = `auto_${Date.now()}`;

      // Live mode: submit real order via agent-key proxy (no wallet needed)
      if (tradingMode === "live") {
        try {
          // Fetch asset index for leverage + order actions
          const metaRes = await fetch("/api/hl/meta");
          const meta = await metaRes.json();
          const assetInfo = meta[asset];
          if (!assetInfo) throw new Error(`Asset meta not loaded for ${asset}`);

          // 1. Set leverage
          const leverageAction = {
            type: "updateLeverage",
            asset: assetInfo.assetId,
            isCross: true,
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
      });

      trailMeta[posId] = { peakPrice: entry, trailTriggerPct, trailRetreatPct, leverage: autoTradeLeverage, direction };

      // Count this trade toward the daily cap + start the cooldown
      useStore.getState().recordAutoTrade();

      addLog(
        `Opened ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | SL $${sl.toFixed(2)} | TP $${tp.toFixed(2)} | Trail +${trailTriggerPct}% | Trade ${useStore.getState().getTradesToday()}/${MAX_TRADES_PER_DAY} today`,
        "trade"
      );
      setStatus((s) => ({ ...s, state: "in_position", lastSignal: reasoning }));
    } catch (e: any) {
      addLog(`Scan failed: ${e.message}`, "error");
      setStatus((s) => ({ ...s, state: "error" }));
    } finally {
      scanningRef.current = false;
    }
  }, [asset, autoTradeLeverage, emergencyStop, tradingMode, openPosition, addLog, hl.setTpSl]);

  // ── Scan timer: only runs when bot is enabled ────────────────────────────
  useEffect(() => {
    if (!autoTradeEnabled || emergencyStop) {
      if (!autoTradeEnabled) setStatus((s) => ({ ...s, state: "idle" }));
      return;
    }
    runScan(); // immediate first scan
    const timer = setInterval(runScan, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoTradeEnabled, emergencyStop, runScan]);

  return status;
}
