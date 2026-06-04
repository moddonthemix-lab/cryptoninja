"use client";

import { useEffect, useRef, useState } from "react";

const HL_WS = "wss://api.hyperliquid.xyz/ws";

export interface FlowTrade { side: "buy" | "sell"; px: number; sz: number; usd: number; time: number; }
export interface OrderFlow {
  connected: boolean;
  buyVol: number;   // taker buy notional in window
  sellVol: number;  // taker sell notional in window
  buyCount: number;
  sellCount: number;
  tape: FlowTrade[]; // most recent trades, newest first
}

// Subscribe to Hyperliquid's live trade prints for a coin and aggregate taker
// buy vs sell pressure over a rolling window (default 2 min).
export function useOrderFlow(coin: string, windowSec = 120): OrderFlow {
  const [flow, setFlow] = useState<OrderFlow>({
    connected: false, buyVol: 0, sellVol: 0, buyCount: 0, sellCount: 0, tape: [],
  });
  const bufRef = useRef<FlowTrade[]>([]);

  useEffect(() => {
    if (!coin) return;
    bufRef.current = [];
    setFlow({ connected: false, buyVol: 0, sellVol: 0, buyCount: 0, sellCount: 0, tape: [] });

    let ws: WebSocket | null = null;
    let closed = false;

    try {
      ws = new WebSocket(HL_WS);
    } catch {
      return;
    }

    let ping: ReturnType<typeof setInterval> | null = null;
    ws.onopen = () => {
      if (closed || !ws) return;
      ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
      setFlow((f) => ({ ...f, connected: true }));
      // Keep-alive — HL drops idle sockets after ~60s
      ping = setInterval(() => { try { ws?.send(JSON.stringify({ method: "ping" })); } catch { /* ignore */ } }, 30_000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.channel !== "trades" || !Array.isArray(msg.data)) return;
        for (const t of msg.data) {
          const sz = parseFloat(t.sz), px = parseFloat(t.px);
          if (!sz || !px) continue;
          bufRef.current.push({
            side: t.side === "B" ? "buy" : "sell",
            px, sz, usd: sz * px, time: t.time ?? Date.now(),
          });
        }
        if (bufRef.current.length > 600) bufRef.current = bufRef.current.slice(-600);
      } catch { /* ignore */ }
    };

    ws.onclose = () => { if (!closed) setFlow((f) => ({ ...f, connected: false })); };
    ws.onerror = () => { if (!closed) setFlow((f) => ({ ...f, connected: false })); };

    // Recompute rolling stats every second
    const tick = setInterval(() => {
      const cutoff = Date.now() - windowSec * 1000;
      bufRef.current = bufRef.current.filter((t) => t.time >= cutoff);
      let buyVol = 0, sellVol = 0, buyCount = 0, sellCount = 0;
      for (const t of bufRef.current) {
        if (t.side === "buy") { buyVol += t.usd; buyCount++; }
        else { sellVol += t.usd; sellCount++; }
      }
      const tape = bufRef.current.slice(-12).reverse();
      setFlow((f) => ({ ...f, buyVol, sellVol, buyCount, sellCount, tape }));
    }, 1000);

    return () => {
      closed = true;
      clearInterval(tick);
      if (ping) clearInterval(ping);
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, [coin, windowSec]);

  return flow;
}
