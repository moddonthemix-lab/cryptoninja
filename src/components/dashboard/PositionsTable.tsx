"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { cn, formatPnl, timeAgo } from "@/lib/utils";
import { ASSETS } from "@/types";

type Tab = "Positions" | "History";

export function PositionsTable() {
  const { openPositions, closedTrades, marketData } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("Positions");

  const openPos = openPositions.filter((p) => p.isOpen);
  const recentTrades = closedTrades.slice(0, 10);

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-lg">
      {/* Tab header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ninja-border/60">
        {(["Positions", "History"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-1 rounded text-xs font-bold transition-all",
              activeTab === tab
                ? "bg-ninja-accent/15 text-ninja-accent border-b-2 border-ninja-accent"
                : "text-ninja-muted hover:text-ninja-text"
            )}
          >
            {tab}
            {tab === "Positions" && openPos.length > 0 && (
              <span className="ml-1.5 px-1 py-0.5 rounded bg-ninja-accent/20 text-ninja-accent text-xs">
                {openPos.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Positions tab */}
      {activeTab === "Positions" && (
        <>
          {openPos.length === 0 ? (
            <div className="px-4 py-5 text-center text-ninja-muted text-xs">
              No open positions
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ninja-muted border-b border-ninja-border/60">
                    <th className="text-left px-3 py-1.5">Asset</th>
                    <th className="text-left px-3 py-1.5">Side</th>
                    <th className="text-right px-3 py-1.5">Entry</th>
                    <th className="text-right px-3 py-1.5">Mark</th>
                    <th className="text-right px-3 py-1.5">SL</th>
                    <th className="text-right px-3 py-1.5">TP</th>
                    <th className="text-right px-3 py-1.5">Lev</th>
                    <th className="text-right px-3 py-1.5">Live PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {openPos.map((pos) => {
                    const mark = marketData[pos.asset]?.price;
                    let livePnl: number | null = null;
                    if (mark != null) {
                      const priceDiff = pos.direction === "long"
                        ? mark - pos.entryPrice
                        : pos.entryPrice - mark;
                      livePnl = priceDiff * pos.size * pos.leverage;
                    }
                    const pnlDisplay = livePnl ?? pos.unrealizedPnl ?? 0;
                    const isLong = pos.direction === "long";
                    return (
                      <tr
                        key={pos.id}
                        className={cn(
                          "border-b border-ninja-border/50 hover:bg-ninja-border/20",
                          isLong ? "border-l-2 border-l-ninja-green" : "border-l-2 border-l-ninja-red"
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <span className="font-bold font-mono" style={{ color: ASSETS[pos.asset].color }}>
                            {pos.asset}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-bold",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {pos.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">${pos.entryPrice.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-ninja-muted">
                          {mark != null ? `$${mark.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-ninja-red">${pos.stopLoss.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-ninja-green">${pos.takeProfit.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{pos.leverage}x</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          <span className={cn(pnlDisplay >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                            {formatPnl(pnlDisplay)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {activeTab === "History" && (
        <>
          {recentTrades.length === 0 ? (
            <div className="px-4 py-5 text-center text-ninja-muted text-xs">
              No trades yet — run a strategy or execute a trade
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ninja-muted border-b border-ninja-border/60">
                    <th className="text-left px-3 py-1.5">Asset</th>
                    <th className="text-left px-3 py-1.5">Side</th>
                    <th className="text-right px-3 py-1.5">Entry</th>
                    <th className="text-right px-3 py-1.5">Exit</th>
                    <th className="text-right px-3 py-1.5">PnL</th>
                    <th className="text-right px-3 py-1.5">Reason</th>
                    <th className="text-right px-3 py-1.5">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => {
                    const isLong = trade.direction === "long";
                    return (
                      <tr
                        key={trade.id}
                        className={cn(
                          "border-b border-ninja-border/50 hover:bg-ninja-border/20",
                          isLong ? "border-l-2 border-l-ninja-green" : "border-l-2 border-l-ninja-red"
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <span className="font-bold font-mono" style={{ color: ASSETS[trade.asset]?.color }}>
                            {trade.asset}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-bold",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {trade.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">${trade.exitPrice?.toFixed(2) ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          <span className={cn((trade.pnl ?? 0) >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                            {formatPnl(trade.pnl ?? 0)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-ninja-muted uppercase">
                          {trade.closeReason ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-ninja-muted">
                          {timeAgo(trade.closedAt ?? trade.openedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
