"use client";

import { useStore } from "@/store/useStore";
import { cn, formatPnl, timeAgo } from "@/lib/utils";
import { ASSETS } from "@/types";

export function PositionsTable() {
  const { openPositions, closedTrades, tradingMode } = useStore();

  const openPos = openPositions.filter((p) => p.isOpen);
  const recentTrades = closedTrades.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Open positions */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl">
        <div className="px-4 py-3 border-b border-ninja-border flex items-center justify-between">
          <span className="font-bold text-sm text-ninja-text">Open Positions</span>
          <span className="text-xs text-ninja-muted">{openPos.length} active</span>
        </div>
        {openPos.length === 0 ? (
          <div className="px-4 py-6 text-center text-ninja-muted text-sm">
            No open positions
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ninja-muted border-b border-ninja-border">
                  <th className="text-left px-4 py-2">Asset</th>
                  <th className="text-left px-4 py-2">Side</th>
                  <th className="text-right px-4 py-2">Entry</th>
                  <th className="text-right px-4 py-2">SL</th>
                  <th className="text-right px-4 py-2">TP</th>
                  <th className="text-right px-4 py-2">Lev</th>
                  <th className="text-right px-4 py-2">PnL</th>
                </tr>
              </thead>
              <tbody>
                {openPos.map((pos) => (
                  <tr key={pos.id} className="border-b border-ninja-border/50 hover:bg-ninja-border/20">
                    <td className="px-4 py-2.5">
                      <span className="font-bold" style={{ color: ASSETS[pos.asset].color }}>
                        {pos.asset}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-bold",
                        pos.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      )}>
                        {pos.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">${pos.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ninja-red">${pos.stopLoss.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ninja-green">${pos.takeProfit.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{pos.leverage}x</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={cn((pos.unrealizedPnl ?? 0) >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                        {formatPnl(pos.unrealizedPnl ?? 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent trades */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl">
        <div className="px-4 py-3 border-b border-ninja-border">
          <span className="font-bold text-sm text-ninja-text">Recent Trades</span>
        </div>
        {recentTrades.length === 0 ? (
          <div className="px-4 py-6 text-center text-ninja-muted text-sm">
            No trades yet — run a strategy or execute a trade
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ninja-muted border-b border-ninja-border">
                  <th className="text-left px-4 py-2">Asset</th>
                  <th className="text-left px-4 py-2">Side</th>
                  <th className="text-right px-4 py-2">Entry</th>
                  <th className="text-right px-4 py-2">Exit</th>
                  <th className="text-right px-4 py-2">PnL</th>
                  <th className="text-right px-4 py-2">Reason</th>
                  <th className="text-right px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-ninja-border/50 hover:bg-ninja-border/20">
                    <td className="px-4 py-2.5">
                      <span className="font-bold" style={{ color: ASSETS[trade.asset]?.color }}>
                        {trade.asset}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-bold",
                        trade.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      )}>
                        {trade.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">${trade.exitPrice?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={cn((trade.pnl ?? 0) >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                        {formatPnl(trade.pnl ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-ninja-muted uppercase text-xs">
                      {trade.closeReason ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-ninja-muted">
                      {timeAgo(trade.closedAt ?? trade.openedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
