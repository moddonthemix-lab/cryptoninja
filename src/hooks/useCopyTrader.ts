"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { priceToWire, sizeToWire } from "@/lib/hyperliquid";
import { ASSETS } from "@/types";
import { notify } from "@/lib/notify";
import type { Asset } from "@/types";

const POLL_MS = 30_000; // check the target trader every 30s

export interface CopyTraderStatus {
  state: "off" | "watching" | "error";
  lastCheck: string | null;
  targetEquity: number | null;
  targetCount: number;
  copiedCount: number;
  log: Array<{ time: string; msg: string; type: "info" | "open" | "close" | "error" }>;
}

const COPY_PREFIX = "copy_";
const symbolOf = (coin: string): string => coin.replace(/^xyz:/, "");

export function useCopyTrader() {
  const { copyTrade, tradingMode, openPositions, openPosition, closePosition, paperBalance, emergencyStop } = useStore();
  const hl = useHyperliquid();
  const hlRef = useRef(hl);
  hlRef.current = hl;
  const busyRef = useRef(false);

  const [status, setStatus] = useState<CopyTraderStatus>({
    state: "off", lastCheck: null, targetEquity: null, targetCount: 0, copiedCount: 0, log: [],
  });

  const addLog = useCallback((msg: string, type: CopyTraderStatus["log"][0]["type"] = "info") => {
    setStatus((s) => ({ ...s, log: [{ time: new Date().toLocaleTimeString(), msg, type }, ...s.log].slice(0, 50) }));
  }, []);

  const tick = useCallback(async () => {
    const cfg = useStore.getState().copyTrade;
    if (!cfg.enabled || emergencyStop) { setStatus((s) => ({ ...s, state: "off" })); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(cfg.targetAddress.trim())) {
      setStatus((s) => ({ ...s, state: "error", lastCheck: new Date().toLocaleTimeString() }));
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus((s) => ({ ...s, state: "watching", lastCheck: new Date().toLocaleTimeString() }));

    try {
      const res = await fetch(`/api/hl/trader?address=${cfg.targetAddress.trim()}`);
      const data = await res.json();
      if (data.error) { addLog(`Target fetch error: ${data.error}`, "error"); setStatus((s) => ({ ...s, state: "error" })); return; }

      const targetPositions: Array<any> = data.positions ?? [];
      const targetEquity: number = data.accountValue ?? 0;
      const live = useStore.getState().tradingMode === "live";

      // Our currently-copied positions (tagged by id prefix)
      const copied = useStore.getState().openPositions.filter((p) => p.isOpen && p.id.startsWith(COPY_PREFIX));
      const copiedAssets = new Set(copied.map((p) => p.asset));
      const targetAssets = new Set<string>();

      const available = live ? (hlRef.current.availableBalance || 0) : useStore.getState().paperBalance;
      const myEquity = live ? (hlRef.current.totalBalance || 0) : useStore.getState().paperBalance;

      // ── Open new copies for target positions we don't yet hold ──
      for (const tp of targetPositions) {
        const sym = symbolOf(tp.coin) as Asset;
        if (!ASSETS[sym]) continue;                 // not in our tradable registry
        targetAssets.add(sym);
        if (copiedAssets.has(sym)) continue;        // already copying this asset (v1: no resize)
        if (tp.direction === "long" && !cfg.copyLongs) continue;
        if (tp.direction === "short" && !cfg.copyShorts) continue;

        const leverage = Math.max(1, Math.min(tp.leverage || cfg.leverageCap, cfg.leverageCap));
        const price = useStore.getState().marketData[sym]?.price || tp.entryPx;
        if (!price) continue;

        // Sizing → target margin
        let marginUsd: number;
        if (cfg.sizingMode === "fixed") {
          marginUsd = cfg.fixedUsd;
        } else if (cfg.sizingMode === "multiplier") {
          marginUsd = (tp.positionValue * cfg.multiplier) / leverage;
        } else { // proportional: same portfolio weighting as the target
          const weight = targetEquity > 0 ? tp.positionValue / targetEquity : 0;
          marginUsd = (weight * myEquity) / leverage;
        }
        marginUsd = Math.min(marginUsd, cfg.maxMarginPerTrade, available);
        const notional = marginUsd * leverage;
        if (marginUsd <= 0 || notional <= 0) { addLog(`Skip ${sym}: no funds to size`, "info"); continue; }

        const size = notional / price;
        const id = `${COPY_PREFIX}${sym}`;
        const direction = tp.direction as "long" | "short";

        try {
          if (live) {
            const meta = await (await fetch("/api/hl/meta")).json();
            const info = meta[sym];
            if (!info) throw new Error(`meta missing for ${sym}`);
            await fetch("/api/hl/trade", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: { type: "updateLeverage", asset: info.assetId, isCross: true, leverage: Math.min(leverage, info.maxLeverage) } }) });
            const isBuy = direction === "long";
            const limitPx = isBuy ? price * 1.01 : price * 0.99;
            const orderRes = await fetch("/api/hl/trade", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: { type: "order", grouping: "na", orders: [{
                a: info.assetId, b: isBuy, p: priceToWire(limitPx, info.szDecimals), s: sizeToWire(size, info.szDecimals), r: false, t: { limit: { tif: "Ioc" } },
              }] } }) });
            const od = await orderRes.json();
            if (od.error) throw new Error(od.error);
          }
          openPosition({
            id, asset: sym, direction, entryPrice: price, currentPrice: price,
            size, leverage, stopLoss: 0, takeProfit: 0, isOpen: true, openedAt: new Date().toISOString(),
          });
          copiedAssets.add(sym);
          addLog(`Copied ${direction.toUpperCase()} ${sym} @ $${price.toFixed(2)} · $${marginUsd.toFixed(2)} margin ${leverage}x`, "open");
          notify(`👥 <b>COPY OPEN</b> · ${live ? "LIVE" : "PAPER"}\n${direction.toUpperCase()} <b>${sym}</b> ${leverage}x @ $${price.toFixed(4)}\nMargin $${marginUsd.toFixed(2)} · mirroring ${cfg.targetAddress.slice(0, 8)}…`);
        } catch (e: any) {
          addLog(`Copy ${sym} failed: ${e.message}`, "error");
        }
      }

      // ── Close copies the target has exited ──
      for (const pos of copied) {
        if (targetAssets.has(pos.asset)) continue;
        const price = useStore.getState().marketData[pos.asset as Asset]?.price || pos.entryPrice;
        try {
          if (live) {
            await hlRef.current.closeLivePosition({ asset: pos.asset as Asset, direction: pos.direction as "long" | "short", size: pos.size, currentPrice: price });
          }
          closePosition(pos.id, price, "manual");
          addLog(`Closed ${pos.asset} — target exited`, "close");
          notify(`👥 <b>COPY CLOSE</b> · ${live ? "LIVE" : "PAPER"}\n${pos.asset} closed @ $${price.toFixed(4)} (target exited)`);
        } catch (e: any) {
          addLog(`Close ${pos.asset} failed: ${e.message}`, "error");
        }
      }

      setStatus((s) => ({
        ...s, state: "watching", targetEquity,
        targetCount: targetPositions.length,
        copiedCount: useStore.getState().openPositions.filter((p) => p.isOpen && p.id.startsWith(COPY_PREFIX)).length,
      }));
    } catch (e: any) {
      addLog(`Tick error: ${e.message}`, "error");
      setStatus((s) => ({ ...s, state: "error" }));
    } finally {
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencyStop, openPosition, closePosition, addLog]);

  useEffect(() => {
    if (!copyTrade.enabled) { setStatus((s) => ({ ...s, state: "off" })); return; }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [copyTrade.enabled, copyTrade.targetAddress, tick]);

  return status;
}
