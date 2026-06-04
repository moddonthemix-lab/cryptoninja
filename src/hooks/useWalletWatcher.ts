"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { notify } from "@/lib/notify";

const POLL_MS = 40_000; // poll tracked wallets every 40s (app-wide, all pages)
const symOf = (coin: string) => coin.replace(/^xyz:/, "");

interface TraderPos {
  coin: string; direction: "long" | "short"; size: number;
  entryPx: number; leverage: number; positionValue: number; unrealizedPnl: number;
}

// Background watcher: polls every tracked wallet, diffs positions, and raises an
// in-app (+ Telegram) notification when a wallet opens or closes a position.
// Mount once (WalletWatcherRunner) so it runs across all pages.
export function useWalletWatcher() {
  const trackedWallets = useStore((s) => s.trackedWallets);
  // Last seen position coins per wallet address (so we only alert on changes)
  const prevRef = useRef<Record<string, Set<string>>>({});
  // Tradable coin set (for the notification's Copy button)
  const tradableRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/hl/meta").then((r) => r.json()).then((m) => {
      if (m && !m.error) tradableRef.current = new Set(Object.keys(m));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (trackedWallets.length === 0) return;
    let cancelled = false;

    const poll = async () => {
      for (const w of useStore.getState().trackedWallets) {
        try {
          const r = await fetch(`/api/hl/trader?address=${w.address}`);
          const d = await r.json();
          if (cancelled || d.error) continue;
          const positions: TraderPos[] = d.positions ?? [];
          const key = w.address.toLowerCase();
          const now = new Set(positions.map((p) => p.coin));
          const prev = prevRef.current[key];
          prevRef.current[key] = now;

          // First time we see this wallet → establish baseline, no alerts
          if (!prev) continue;

          const label = w.label || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;

          // Opened: in now, not in prev
          for (const p of positions) {
            if (prev.has(p.coin)) continue;
            const sym = symOf(p.coin);
            useStore.getState().addNotification({
              id: `${key}_${p.coin}_open_${p.entryPx}_${Date.now()}`,
              kind: "open", address: w.address, label, coin: p.coin, sym,
              direction: p.direction, leverage: p.leverage, entryPx: p.entryPx,
              positionValue: p.positionValue, time: Date.now(),
              tradable: tradableRef.current.has(sym),
            });
            notify(`🛰️ <b>${label}</b> opened ${p.direction.toUpperCase()} <b>${sym}</b> ${p.leverage}x @ $${p.entryPx.toFixed(4)}`);
          }

          // Closed: in prev, not in now
          for (const coin of Array.from(prev)) {
            if (now.has(coin)) continue;
            const sym = symOf(coin);
            useStore.getState().addNotification({
              id: `${key}_${coin}_close_${Date.now()}`,
              kind: "close", address: w.address, label, coin, sym,
              direction: "long", leverage: 0, entryPx: 0, positionValue: 0,
              time: Date.now(), tradable: tradableRef.current.has(sym),
            });
            notify(`🛰️ <b>${label}</b> closed <b>${sym}</b>`);
          }
        } catch { /* skip this wallet this round */ }
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [trackedWallets]);
}
