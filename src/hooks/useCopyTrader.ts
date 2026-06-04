"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { priceToWire, sizeToWire } from "@/lib/hyperliquid";
import { ASSETS } from "@/types";
import { notify } from "@/lib/notify";
import type { Asset } from "@/types";

const POLL_MS = 30_000; // check the target trader every 30s

const COPY_PREFIX = "copy_";
const symbolOf = (coin: string): string => coin.replace(/^xyz:/, "");

// Background mirror engine. Mount ONCE (CopyTraderRunner). Reads config + writes
// status/log to the store so the COPY tab can show live activity.
export function useCopyTrader() {
  const { copyTrade, copySyncNonce, emergencyStop, openPosition, closePosition } = useStore();
  const hl = useHyperliquid();
  const hlRef = useRef(hl);
  hlRef.current = hl;
  const busyRef = useRef(false);

  const log = useCallback((msg: string, type: "info" | "open" | "close" | "error" = "info") => {
    useStore.getState().addCopyLog({ time: new Date().toLocaleTimeString(), msg, type });
  }, []);

  const tick = useCallback(async () => {
    const cfg = useStore.getState().copyTrade;
    const setStatus = useStore.getState().setCopyStatus;
    if (!cfg.enabled || emergencyStop) { setStatus({ state: "off" }); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(cfg.targetAddress.trim())) {
      setStatus({ state: "error", lastCheck: new Date().toLocaleTimeString() });
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus({ state: "watching", lastCheck: new Date().toLocaleTimeString() });

    try {
      const res = await fetch(`/api/hl/trader?address=${cfg.targetAddress.trim()}`);
      const data = await res.json();
      if (data.error) { log(`Target fetch error: ${data.error}`, "error"); setStatus({ state: "error" }); return; }

      const targetPositions: Array<any> = data.positions ?? [];
      const targetEquity: number = data.accountValue ?? 0;
      const live = useStore.getState().tradingMode === "live";

      const copied = useStore.getState().openPositions.filter((p) => p.isOpen && p.id.startsWith(COPY_PREFIX));
      const copiedAssets = new Set(copied.map((p) => p.asset));
      const targetAssets = new Set<string>();

      // Read buying power straight from the account endpoint (documented fields)
      // so we don't depend on the background hook's state being loaded yet.
      let available: number;
      let myEquity: number;
      if (live) {
        try {
          const acc = await (await fetch("/api/hl/account")).json();
          const cms = acc?.state?.crossMarginSummary;
          const accountValue = parseFloat(cms?.accountValue ?? "0") || 0;
          const marginUsed = parseFloat(cms?.totalMarginUsed ?? "0") || 0;
          const wd = parseFloat(acc?.state?.withdrawable ?? "0") || 0;
          const spot = acc?.spotUsdcBalance || 0;
          myEquity = Math.max(accountValue, spot);
          available = Math.max(accountValue - marginUsed, wd, spot);
        } catch { available = 0; myEquity = 0; }
      } else {
        available = myEquity = useStore.getState().paperBalance;
      }
      if (live && myEquity <= 0) { log("Waiting for account data… (will retry)", "info"); setStatus({ state: "watching" }); return; }

      // ── Open new copies for target positions we don't yet hold ──
      for (const tp of targetPositions) {
        const sym = symbolOf(tp.coin) as Asset;
        if (!ASSETS[sym]) continue;
        targetAssets.add(sym);
        if (copiedAssets.has(sym)) continue;
        if (tp.direction === "long" && !cfg.copyLongs) continue;
        if (tp.direction === "short" && !cfg.copyShorts) continue;

        const leverage = Math.max(1, Math.min(tp.leverage || cfg.leverageCap, cfg.leverageCap));
        const price = useStore.getState().marketData[sym]?.price || tp.entryPx;
        if (!price) continue;

        let marginUsd: number;
        if (cfg.sizingMode === "fixed") marginUsd = cfg.fixedUsd;
        else if (cfg.sizingMode === "multiplier") marginUsd = (tp.positionValue * cfg.multiplier) / leverage;
        else { const weight = targetEquity > 0 ? tp.positionValue / targetEquity : 0; marginUsd = (weight * myEquity) / leverage; }
        marginUsd = Math.min(marginUsd, cfg.maxMarginPerTrade, available);

        if (available <= 0) { log(`Skip ${sym}: no free margin (free $${available.toFixed(2)}, equity $${myEquity.toFixed(2)}). Funds may be tied up in open positions — close some or add USDC.`, "error"); continue; }

        let notional = marginUsd * leverage;
        const MIN_NOTIONAL = 10; // Hyperliquid minimum order value
        if (notional < MIN_NOTIONAL) {
          // Bump up to the $10 minimum if there's enough free margin to support it
          if (available * leverage >= MIN_NOTIONAL) {
            notional = MIN_NOTIONAL;
            marginUsd = MIN_NOTIONAL / leverage;
          } else {
            log(`Skip ${sym}: order ~$${notional.toFixed(2)} < $10 min (free $${available.toFixed(2)} × ${leverage}x). Raise leverage cap or add funds.`, "error");
            continue;
          }
        }

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
          log(`Copied ${direction.toUpperCase()} ${sym} @ $${price.toFixed(2)} · $${marginUsd.toFixed(2)} margin ${leverage}x`, "open");
          notify(`👥 <b>COPY OPEN</b> · ${live ? "LIVE" : "PAPER"}\n${direction.toUpperCase()} <b>${sym}</b> ${leverage}x @ $${price.toFixed(4)}\nMargin $${marginUsd.toFixed(2)} · mirroring ${cfg.targetAddress.slice(0, 8)}…`);
        } catch (e: any) {
          log(`Copy ${sym} failed: ${e.message}`, "error");
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
          log(`Closed ${pos.asset} — target exited`, "close");
          notify(`👥 <b>COPY CLOSE</b> · ${live ? "LIVE" : "PAPER"}\n${pos.asset} closed @ $${price.toFixed(4)} (target exited)`);
        } catch (e: any) {
          log(`Close ${pos.asset} failed: ${e.message}`, "error");
        }
      }

      const copiedNow = useStore.getState().openPositions.filter((p) => p.isOpen && p.id.startsWith(COPY_PREFIX)).length;
      setStatus({ state: "watching", targetEquity, targetCount: targetPositions.length, copiedCount: copiedNow });
      if (targetPositions.length === 0) log("Target has no open positions — waiting", "info");
    } catch (e: any) {
      log(`Tick error: ${e.message}`, "error");
      setStatus({ state: "error" });
    } finally {
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencyStop, openPosition, closePosition, log]);

  // Poll loop while enabled
  useEffect(() => {
    if (!copyTrade.enabled) { useStore.getState().setCopyStatus({ state: "off" }); return; }
    log(`Watching ${copyTrade.targetAddress.slice(0, 10)}… every ${POLL_MS / 1000}s`, "info");
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [copyTrade.enabled, copyTrade.targetAddress, tick, log]);

  // Manual "Sync now" trigger
  useEffect(() => {
    if (copySyncNonce > 0 && copyTrade.enabled) tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copySyncNonce]);
}
