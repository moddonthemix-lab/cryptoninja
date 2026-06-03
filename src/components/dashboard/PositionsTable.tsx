"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { cn, formatPnl, timeAgo } from "@/lib/utils";
import { ASSETS } from "@/types";
import { X } from "lucide-react";

type Tab = "Positions" | "History";

export function PositionsTable() {
  const { openPositions, closedTrades, marketData, closePosition } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("Positions");
  const [closing, setClosing] = useState<string | null>(null);

  const openPos = openPositions.filter((p) => p.isOpen);
  const recentTrades = closedTrades.slice(0, 20);

  const handleClose = (posId: string, exitPrice: number) => {
    setClosing(posId);
    closePosition(posId, exitPrice, "manual");
    setTimeout(() => setClosing(null), 300);
  };

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
                  <tr className="text-ninja-muted border-b border-ninja-border/60 uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Asset</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Entry</th>
                    <th className="text-right px-3 py-2">Mark</th>
                    <th className="text-right px-3 py-2">SL / TP</th>
                    <th className="text-right px-3 py-2">Size × Lev</th>
                    <th className="text-right px-3 py-2">Margin</th>
                    <th className="text-right px-3 py-2">Live PnL</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {openPos.map((pos) => {
                    const mark = marketData[pos.asset]?.price;
                    const margin = (pos.size * pos.entryPrice) / pos.leverage;
                    const notional = pos.size * pos.entryPrice;

                    let livePnl = 0;
                    let livePnlPct = 0;
                    if (mark != null) {
                      const priceDiff = pos.direction === "long"
                        ? mark - pos.entryPrice
                        : pos.entryPrice - mark;
                      livePnl = priceDiff * pos.size * pos.leverage;
                      livePnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
                    } else {
                      livePnl = pos.unrealizedPnl ?? 0;
                      livePnlPct = margin > 0 ? (livePnl / margin) * 100 : 0;
                    }

                    const isLong = pos.direction === "long";
                    const isClosing = closing === pos.id;
                    const exitPrice = mark ?? pos.entryPrice;

                    return (
                      <tr
                        key={pos.id}
                        className={cn(
                          "border-b border-ninja-border/40 hover:bg-ninja-border/20 transition-opacity",
                          isLong ? "border-l-2 border-l-green-500/70" : "border-l-2 border-l-red-500/70",
                          isClosing && "opacity-40"
                        )}
                      >
                        {/* Asset */}
                        <td className="px-3 py-2">
                          <span className="font-bold font-mono" style={{ color: ASSETS[pos.asset].color }}>
                            {pos.asset}
                          </span>
                        </td>

                        {/* Side */}
                        <td className="px-3 py-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-bold",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {pos.direction.toUpperCase()}
                          </span>
                        </td>

                        {/* Entry */}
                        <td className="px-3 py-2 text-right font-mono text-ninja-text">
                          ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Mark */}
                        <td className="px-3 py-2 text-right font-mono text-ninja-muted">
                          {mark != null
                            ? `$${mark.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </td>

                        {/* SL / TP */}
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          <span className="text-ninja-red">${pos.stopLoss.toFixed(2)}</span>
                          <span className="text-ninja-muted mx-1">/</span>
                          <span className="text-ninja-green">${pos.takeProfit.toFixed(2)}</span>
                        </td>

                        {/* Size × Leverage */}
                        <td className="px-3 py-2 text-right font-mono text-ninja-text whitespace-nowrap">
                          <span>{pos.size.toFixed(4)}</span>
                          <span className="text-ninja-muted ml-1">×</span>
                          <span className={cn(
                            "ml-1 font-bold",
                            pos.leverage > 10 ? "text-red-400" : pos.leverage > 5 ? "text-yellow-400" : "text-ninja-green"
                          )}>
                            {pos.leverage}x
                          </span>
                        </td>

                        {/* Margin used */}
                        <td className="px-3 py-2 text-right font-mono text-ninja-muted whitespace-nowrap">
                          ${margin.toFixed(2)}
                          <span className="text-ninja-muted/50 ml-1 text-xs">(${notional.toFixed(0)} notional)</span>
                        </td>

                        {/* Live PnL + % */}
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          <span className={cn("font-bold", livePnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                            {livePnl >= 0 ? "+" : ""}${Math.abs(livePnl).toFixed(2)}
                          </span>
                          <span className={cn(
                            "ml-1.5 text-xs",
                            livePnlPct >= 0 ? "text-ninja-green/70" : "text-ninja-red/70"
                          )}>
                            ({livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(1)}%)
                          </span>
                        </td>

                        {/* Close button */}
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleClose(pos.id, exitPrice)}
                            disabled={isClosing}
                            title="Close position at market price"
                            className="flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
                          >
                            <X size={10} />
                            Close
                          </button>
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
              No trades yet — run the auto trader or execute a trade
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ninja-muted border-b border-ninja-border/60 uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Asset</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Entry</th>
                    <th className="text-right px-3 py-2">Exit</th>
                    <th className="text-right px-3 py-2">Margin</th>
                    <th className="text-right px-3 py-2">PnL / %</th>
                    <th className="text-right px-3 py-2">Reason</th>
                    <th className="text-right px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => {
                    const isLong = trade.direction === "long";
                    const margin = (trade.size * trade.entryPrice) / trade.leverage;
                    const pnl = trade.pnl ?? 0;
                    const pnlPct = trade.pnlPercent ?? (margin > 0 ? (pnl / margin) * 100 : 0);

                    const reasonColor =
                      trade.closeReason === "tp" ? "text-ninja-green"
                      : trade.closeReason === "sl" ? "text-ninja-red"
                      : trade.closeReason === "manual" ? "text-ninja-accent"
                      : "text-ninja-muted";

                    return (
                      <tr
                        key={trade.id}
                        className={cn(
                          "border-b border-ninja-border/40 hover:bg-ninja-border/20",
                          isLong ? "border-l-2 border-l-green-500/70" : "border-l-2 border-l-red-500/70"
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className="font-bold font-mono" style={{ color: ASSETS[trade.asset]?.color }}>
                            {trade.asset}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-bold",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {trade.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ${trade.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {trade.exitPrice
                            ? `$${trade.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ninja-muted">
                          ${margin.toFixed(2)}
                          <span className="text-ninja-muted/50 ml-1">{trade.leverage}x</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          <span className={cn("font-bold", pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                            {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                          </span>
                          <span className={cn("ml-1.5 text-xs", pnlPct >= 0 ? "text-ninja-green/70" : "text-ninja-red/70")}>
                            ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                          </span>
                        </td>
                        <td className={cn("px-3 py-2 text-right font-bold uppercase", reasonColor)}>
                          {trade.closeReason ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-ninja-muted">
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
