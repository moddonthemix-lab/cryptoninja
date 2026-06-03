"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
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

    // Allow up to 2 concurrent positions per asset
    const openCount = useStore.getState().openPositions.filter(
      (p) => p.isOpen && p.asset === asset
    ).length;
    if (openCount >= 2) return;

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

      // Live mode: sign and submit real order
      if (tradingMode === "live") {
        try {
          addLog(`Setting ${autoTradeLeverage}x leverage on Hyperliquid...`, "info");
          await hl.setLeverage(asset, autoTradeLeverage);
          addLog(`Submitting ${direction.toUpperCase()} market order to Hyperliquid...`, "info");
          await hl.placeMarketOrder({ asset, direction, sizeUsd: positionUsd, currentPrice: entry });
          addLog(`Live order submitted`, "trade");
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

      addLog(
        `Opened ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | SL $${sl.toFixed(2)} | TP $${tp.toFixed(2)} | Trail +${trailTriggerPct}%`,
        "trade"
      );
      setStatus((s) => ({ ...s, state: "in_position", lastSignal: reasoning }));
    } catch (e: any) {
      addLog(`Scan failed: ${e.message}`, "error");
      setStatus((s) => ({ ...s, state: "error" }));
    } finally {
      scanningRef.current = false;
    }
  }, [asset, autoTradeLeverage, emergencyStop, tradingMode, openPosition, addLog, hl.setLeverage, hl.placeMarketOrder]);

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
