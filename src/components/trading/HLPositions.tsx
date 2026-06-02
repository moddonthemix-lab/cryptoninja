"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn } from "@/lib/utils";
import { RefreshCw, X } from "lucide-react";

interface HLPos {
  coin: string;
  szi: string;
  entryPx: string;
  unrealizedPnl: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  returnOnEquity: string;
}

interface HLOrder {
  coin: string;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  oid: number;
}

export function HLPositions() {
  const { address } = useAccount();
  const { tradingMode } = useStore();
  const { cancelOrder, loading } = useHyperliquid();
  const [positions, setPositions] = useState<HLPos[]>([]);
  const [orders, setOrders] = useState<HLOrder[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!address || tradingMode !== "live") return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/hl/account?address=${address}`);
      const data = await res.json();
      if (data.error) return;

      const allPos: HLPos[] = (data.state?.assetPositions ?? [])
        .map((ap: any) => ap.position)
        .filter((p: HLPos) => parseFloat(p.szi) !== 0);

      setPositions(allPos);
      setOrders(data.orders ?? []);
      setBalance(data.state?.crossMarginSummary?.accountValue ?? null);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [address, tradingMode]);

  if (tradingMode !== "live") return null;

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ninja-border">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-ninja-text">Hyperliquid Positions</span>
          {balance && (
            <span className="text-xs text-ninja-muted">
              Balance: <span className="text-ninja-green font-mono">${parseFloat(balance).toFixed(2)}</span>
            </span>
          )}
        </div>
        <button onClick={load} disabled={refreshing} className="text-ninja-muted hover:text-ninja-accent transition-colors">
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
        </button>
      </div>

      {positions.length === 0 && orders.length === 0 ? (
        <div className="px-4 py-6 text-center text-ninja-muted text-sm">
          No open positions on Hyperliquid
        </div>
      ) : (
        <div className="overflow-x-auto">
          {positions.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ninja-muted border-b border-ninja-border">
                  <th className="text-left px-4 py-2">Asset</th>
                  <th className="text-left px-4 py-2">Side</th>
                  <th className="text-right px-4 py-2">Size</th>
                  <th className="text-right px-4 py-2">Entry</th>
                  <th className="text-right px-4 py-2">Liq Price</th>
                  <th className="text-right px-4 py-2">Lev</th>
                  <th className="text-right px-4 py-2">uPnL</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => {
                  const size = parseFloat(pos.szi);
                  const pnl = parseFloat(pos.unrealizedPnl);
                  return (
                    <tr key={i} className="border-b border-ninja-border/30 hover:bg-ninja-border/10">
                      <td className="px-4 py-2.5 font-bold text-ninja-text">{pos.coin}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("px-1.5 py-0.5 rounded font-bold",
                          size > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {size > 0 ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{Math.abs(size).toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">${parseFloat(pos.entryPx).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-400">
                        {pos.liquidationPx ? `$${parseFloat(pos.liquidationPx).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{pos.leverage.value}x</td>
                      <td className={cn("px-4 py-2.5 text-right font-mono", pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {orders.length > 0 && (
            <div className="border-t border-ninja-border">
              <div className="px-4 py-2 text-xs text-ninja-muted font-semibold uppercase tracking-wide">Open Orders</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ninja-muted">
                    <th className="text-left px-4 py-1">Asset</th>
                    <th className="text-left px-4 py-1">Side</th>
                    <th className="text-right px-4 py-1">Price</th>
                    <th className="text-right px-4 py-1">Size</th>
                    <th className="text-right px-4 py-1">Cancel</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.oid} className="border-t border-ninja-border/20">
                      <td className="px-4 py-2 font-bold">{ord.coin}</td>
                      <td className="px-4 py-2">
                        <span className={cn("px-1.5 py-0.5 rounded font-bold",
                          ord.side === "B" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {ord.side === "B" ? "BUY" : "SELL"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">${parseFloat(ord.limitPx).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">{ord.sz}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => cancelOrder(ord.coin as any, ord.oid).then(load)}
                          disabled={loading}
                          className="text-ninja-muted hover:text-ninja-red transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
