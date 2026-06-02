"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Asset } from "@/types";

const SCAN_INTERVAL_MS = 5 * 60 * 1000; // scan every 5 minutes
const PRICE_POLL_MS = 10 * 1000;         // check SL/TP/trail every 10 seconds

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
  trailTriggerPct: number; // % margin profit to activate trailing
  trailRetreatPct: number; // % retrace from peak to close
  leverage: number;
  direction: "long" | "short";
}> = {};

export function useAutoTrader(asset: Asset) {
  const {
    autoTradeEnabled, autoTradeLeverage, emergencyStop,
    openPosition, closePosition, openPositions, marketData,
    paperBalance,
  } = useStore();

  const [status, setStatus] = useState<AutoTraderStatus>({
    state: "idle",
    lastSignal: null,
    lastScanTime: null,
    currentPnlPct: null,
    peakPnlPct: null,
    trailActive: false,
    log: [],
  });

  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false);

  const addLog = useCallback((msg: string, type: AutoTraderStatus["log"][0]["type"] = "info") => {
    const entry = { time: new Date().toLocaleTimeString(), msg, type };
    setStatus((s) => ({ ...s, log: [entry, ...s.log].slice(0, 60) }));
  }, []);

  // ── Price monitor: check SL/TP/trailing stop every 10s ──
  const monitorPrices = useCallback(() => {
    const positions = useStore.getState().openPositions.filter((p) => p.isOpen && p.asset === asset);
    const price = useStore.getState().marketData[asset]?.price;
    if (!price || positions.length === 0) return;

    for (const pos of positions) {
      const meta = trailMeta[pos.id];
      const direction = pos.direction as "long" | "short";

      // Unrealized P&L as % of margin
      const priceDiff = direction === "long" ? price - pos.entryPrice : pos.entryPrice - price;
      const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;

      // Hard SL (30% of margin)
      if (pnlPct <= -30) {
        closePosition(pos.id, price, "sl");
        if (meta) delete trailMeta[pos.id];
        addLog(`🔴 SL hit on ${asset} @ $${price.toFixed(2)} (−30% margin)`, "sl");
        setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
        return;
      }

      // Hard TP (from original tp price)
      if (direction === "long" && price >= pos.takeProfit) {
        closePosition(pos.id, price, "tp");
        if (meta) delete trailMeta[pos.id];
        addLog(`🟢 TP hit on ${asset} @ $${price.toFixed(2)} (+${pnlPct.toFixed(1)}% margin)`, "tp");
        setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
        return;
      }
      if (direction === "short" && price <= pos.takeProfit) {
        closePosition(pos.id, price, "tp");
        if (meta) delete trailMeta[pos.id];
        addLog(`🟢 TP hit on ${asset} @ $${price.toFixed(2)} (+${pnlPct.toFixed(1)}% margin)`, "tp");
        setStatus((s) => ({ ...s, state: "idle", currentPnlPct: null, peakPnlPct: null, trailActive: false }));
        return;
      }

      // Trailing stop
      if (meta) {
        // Update peak
        if (pnlPct > (meta.peakPrice === pos.entryPrice ? 0 :
          (direction === "long"
            ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice * 100 * meta.leverage
            : (pos.entryPrice - meta.peakPrice) / pos.entryPrice * 100 * meta.leverage)
        )) {
          meta.peakPrice = price;
        }

        const peakPnlPct = (direction === "long"
          ? (meta.peakPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - meta.peakPrice) / pos.entryPrice
        ) * 100 * meta.leverage;

        const trailActive = peakPnlPct >= meta.trailTriggerPct;

        setStatus((s) => ({
          ...s,
          state: "in_position",
          currentPnlPct: pnlPct,
          peakPnlPct,
          trailActive,
        }));

        if (trailActive) {
          // Retreat from peak
          const retreatAmount = peakPnlPct * (meta.trailRetreatPct / 100);
          const trailStopPnlPct = peakPnlPct - retreatAmount;

          if (pnlPct <= trailStopPnlPct && pnlPct > 0) {
            closePosition(pos.id, price, "tp");
            delete trailMeta[pos.id];
            addLog(
              `🔒 Trail stop triggered on ${asset} @ $${price.toFixed(2)} — locked in +${pnlPct.toFixed(1)}% (peak was +${peakPnlPct.toFixed(1)}%)`,
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
  }, [asset, closePosition, addLog]);

  // ── Scanner: ask Claude every 5 minutes ──
  const runScan = useCallback(async () => {
    if (scanningRef.current || emergencyStop) return;

    // Wait until all current positions on this asset are closed before opening another
    // (prevents stacking unlimited positions — one active trade per asset at a time)
    const openCount = useStore.getState().openPositions.filter((p) => p.isOpen && p.asset === asset).length;
    if (openCount >= 2) return; // allow up to 2 concurrent positions on the same asset

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

      const now = new Date().toLocaleTimeString();

      if (!data.shouldTrade) {
        const reason = data.reason ?? "No signal";
        addLog(`${now} — No trade. ${reason}. RSI: ${data.rsi?.toFixed(0) ?? "—"}, Vol: ${data.volumeLabel ?? "—"}`, "info");
        setStatus((s) => ({ ...s, state: "idle", lastSignal: reason }));
        return;
      }

      const { direction, confidence, entry, sl, tp, tpPct, reasoning,
        trailTriggerPct = 20, trailRetreatPct = 35 } = data;

      addLog(
        `Signal: ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | conf ${confidence}% | TP ${tpPct}% margin | ${reasoning}`,
        "trade"
      );

      // Position size: 5% of paper balance per trade
      const currentBalance = useStore.getState().paperBalance;
      const positionUsd = currentBalance * 0.05;
      const size = positionUsd / entry;

      const posId = `auto_${Date.now()}`;
      openPosition({
        id: posId,
        asset,
        direction,
        entryPrice: entry,
        currentPrice: entry,
        size,
        leverage: autoTradeLeverage,
        stopLoss: sl,
        takeProfit: tp,
        isOpen: true,
        openedAt: new Date().toISOString(),
      });

      // Register trailing stop metadata
      trailMeta[posId] = {
        peakPrice: entry,
        trailTriggerPct,
        trailRetreatPct,
        leverage: autoTradeLeverage,
        direction,
      };

      addLog(
        `Opened ${direction.toUpperCase()} ${asset} @ $${entry.toFixed(2)} | SL $${sl.toFixed(2)} | TP $${tp.toFixed(2)} (${tpPct}%) | Trail activates at +${trailTriggerPct}%`,
        "trade"
      );
      setStatus((s) => ({ ...s, state: "in_position", lastSignal: reasoning }));
    } catch (e: any) {
      addLog(`Scan failed: ${e.message}`, "error");
      setStatus((s) => ({ ...s, state: "error" }));
    } finally {
      scanningRef.current = false;
    }
  }, [asset, autoTradeLeverage, emergencyStop, openPosition, addLog]);

  // ── Start/stop based on autoTradeEnabled ──
  useEffect(() => {
    if (autoTradeEnabled && !emergencyStop) {
      runScan(); // immediate first scan
      scanTimerRef.current = setInterval(runScan, SCAN_INTERVAL_MS);
      priceTimerRef.current = setInterval(monitorPrices, PRICE_POLL_MS);
    } else {
      if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
      if (priceTimerRef.current) { clearInterval(priceTimerRef.current); priceTimerRef.current = null; }
      if (!autoTradeEnabled) {
        setStatus((s) => ({ ...s, state: "idle" }));
      }
    }
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      if (priceTimerRef.current) clearInterval(priceTimerRef.current);
    };
  }, [autoTradeEnabled, emergencyStop, runScan, monitorPrices]);

  return status;
}
