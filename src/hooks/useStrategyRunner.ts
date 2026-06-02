"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store/useStore";
import type { Asset, Strategy } from "@/types";

export interface ScanResult {
  signal: boolean;
  pattern?: string;
  direction?: "long" | "short";
  actionable?: boolean;
  patternType?: string;
  description?: string;
  suggestedEntry?: number;
  suggestedSL?: number;
  suggestedTP?: number;
  currentPrice?: number;
  detectedPatterns?: Array<{ name: string; direction: string; type: string; actionable: boolean }>;
  lastCandles?: Array<{ time: number; stratType: string | number; open: number; high: number; low: number; close: number }>;
  reason?: string;
  error?: string;
}

export interface RunnerLog {
  time: string;
  message: string;
  type: "info" | "signal" | "trade" | "sl" | "tp" | "error";
}

const SCAN_INTERVALS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function useStrategyRunner(strategy: Strategy | null, timeframe: string = "1h") {
  const { openPosition, closePosition, openPositions, marketData, emergencyStop } = useStore();
  const [running, setRunning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [logs, setLogs] = useState<RunnerLog[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((message: string, type: RunnerLog["type"] = "info") => {
    const entry: RunnerLog = {
      time: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const scan = useCallback(async () => {
    if (!strategy || emergencyStop) return;

    setScanCount((c) => c + 1);

    // Check SL/TP on open positions for this strategy
    const stratPositions = openPositions.filter((p) => p.isOpen);
    for (const pos of stratPositions) {
      const price = marketData[pos.asset as Asset]?.price;
      if (!price) continue;

      if (pos.direction === "long") {
        if (price <= pos.stopLoss) {
          closePosition(pos.id, price, "sl");
          log(`SL hit on ${pos.asset} @ $${price.toFixed(2)}`, "sl");
          continue;
        }
        if (price >= pos.takeProfit) {
          closePosition(pos.id, price, "tp");
          log(`TP hit on ${pos.asset} @ $${price.toFixed(2)}`, "tp");
          continue;
        }
      } else {
        if (price >= pos.stopLoss) {
          closePosition(pos.id, price, "sl");
          log(`SL hit on ${pos.asset} @ $${price.toFixed(2)}`, "sl");
          continue;
        }
        if (price <= pos.takeProfit) {
          closePosition(pos.id, price, "tp");
          log(`TP hit on ${pos.asset} @ $${price.toFixed(2)}`, "tp");
          continue;
        }
      }
    }

    // Scan for new signals
    try {
      const res = await fetch("/api/paper/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: strategy.asset,
          stratPattern: (strategy as any).stratPattern ?? null,
          direction: strategy.direction,
          timeframe,
        }),
      });
      const result: ScanResult = await res.json();
      setLastScan(result);

      if (result.error) {
        log(`Scan error: ${result.error}`, "error");
        return;
      }

      if (!result.signal) {
        log(`No signal — patterns: ${result.detectedPatterns?.map((p) => p.name).join(", ") || "none"}`, "info");
        return;
      }

      log(`Signal: ${result.pattern} (${result.direction?.toUpperCase()}) @ $${result.currentPrice?.toFixed(2)}`, "signal");

      // Don't open if already have an open position on this asset
      const alreadyOpen = openPositions.some((p) => p.asset === strategy.asset && p.isOpen);
      if (alreadyOpen) {
        log(`Already in position on ${strategy.asset}, skipping`, "info");
        return;
      }

      // Open paper trade
      const currentPrice = marketData[strategy.asset as Asset]?.price ?? result.currentPrice ?? 0;
      if (!currentPrice) return;

      const slPct = strategy.stopLoss / 100;
      const tpPct = strategy.takeProfit / 100;
      const sl = result.direction === "long"
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct);
      const tp = result.direction === "long"
        ? currentPrice * (1 + tpPct)
        : currentPrice * (1 - tpPct);

      // Position size in base units
      const positionUsd = strategy.positionSizeType === "percent"
        ? (useStore.getState().paperBalance * strategy.positionSize) / 100
        : strategy.positionSize;
      const size = positionUsd / currentPrice;

      openPosition({
        id: `strat_${Date.now()}`,
        asset: strategy.asset as Asset,
        direction: result.direction!,
        entryPrice: currentPrice,
        currentPrice,
        size,
        leverage: strategy.leverage,
        stopLoss: sl,
        takeProfit: tp,
        isOpen: true,
        openedAt: new Date().toISOString(),
      });

      log(
        `Opened ${result.direction?.toUpperCase()} ${strategy.asset} @ $${currentPrice.toFixed(2)} | SL $${sl.toFixed(2)} | TP $${tp.toFixed(2)}`,
        "trade"
      );
    } catch (e: any) {
      log(`Scan failed: ${e.message}`, "error");
    }
  }, [strategy, timeframe, openPositions, marketData, emergencyStop, openPosition, closePosition, log]);

  const start = useCallback(() => {
    if (!strategy) return;
    setRunning(true);
    log(`Started scanning ${strategy.asset} on ${timeframe} for ${(strategy as any).stratPattern ?? "any TheStrat pattern"}`, "info");
    scan(); // immediate first scan
    const ms = SCAN_INTERVALS[timeframe] ?? 3_600_000;
    intervalRef.current = setInterval(scan, ms);
  }, [strategy, timeframe, scan, log]);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    log("Scanner stopped", "info");
  }, [log]);

  // Stop if emergency stop triggered
  useEffect(() => {
    if (emergencyStop && running) stop();
  }, [emergencyStop, running, stop]);

  // Clean up on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { running, start, stop, lastScan, logs, scanCount };
}
