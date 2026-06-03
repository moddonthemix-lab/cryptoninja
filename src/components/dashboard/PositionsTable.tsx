"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn, timeAgo } from "@/lib/utils";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { X } from "lucide-react";

type Tab = "Positions" | "History";

// Normalized position shape so paper + live render through one table
interface DisplayPosition {
  id: string;
  asset: Asset;
  direction: "long" | "short";
  size: number;
  entryPrice: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  isLive: boolean;
  liqPrice?: number | null;
  unrealizedPnl?: number;
}

export function PositionsTable() {
  const { openPositions, closedTrades, marketData, closePosition, tradingMode } = useStore();
  const { livePositions, closeLivePosition } = useHyperliquid();
  const [activeTab, setActiveTab] = useState<Tab>("Positions");
  const [closing, setClosing] = useState<string | null>(null);

  const isLive = tradingMode === "live";

  // Build the display list from the right source
  const positions: DisplayPosition[] = isLive
    ? livePositions.map((p) => {
        const szi = parseFloat(p.szi);
        return {
          id: p.coin,
          asset: p.coin as Asset,
          direction: szi >= 0 ? "long" : "short",
          size: Math.abs(szi),
          entryPrice: parseFloat(p.entryPx),
          leverage: p.leverage?.value ?? 1,
          stopLoss: null,
          takeProfit: null,
          isLive: true,
          liqPrice: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
          unrealizedPnl: parseFloat(p.unrealizedPnl),
        };
      })
    : openPositions
        .filter((p) => p.isOpen)
        .map((p) => ({
          id: p.id,
          asset: p.asset,
          direction: p.direction as "long" | "short",
          size: p.size,
          entryPrice: p.entryPrice,
          leverage: p.leverage,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          isLive: false,
          unrealizedPnl: p.unrealizedPnl,
        }));

  const recentTrades = closedTrades.slice(0, 20);

  const handleClose = async (pos: DisplayPosition, exitPrice: number) => {
    setClosing(pos.id);
    try {
      if (pos.isLive) {
        await closeLivePosition({
          asset: pos.asset,
          direction: pos.direction,
          size: pos.size,
          currentPrice: exitPrice,
        });
      } else {
        closePosition(pos.id, exitPrice, "manual");
      }
    } catch {
      // error surfaced elsewhere; just clear the closing state
    }
    setTimeout(() => setClosing(null), 400);
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
            {tab === "Positions" && positions.length > 0 && (
              <span className="ml-1.5 px-1 py-0.5 rounded bg-ninja-accent/20 text-ninja-accent text-xs">
                {positions.length}
              </span>
            )}
          </button>
        ))}
        {isLive && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">
            LIVE · Hyperliquid
          </span>
        )}
      </div>

      {/* Positions tab */}
      {activeTab === "Positions" && (
        <>
          {positions.length === 0 ? (
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
                    <th className="text-right px-3 py-2">{isLive ? "Liq." : "SL / TP"}</th>
                    <th className="text-right px-3 py-2">Size × Lev</th>
                    <th className="text-right px-3 py-2">Margin</th>
                    <th className="text-right px-3 py-2">Live PnL</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const mark = marketData[pos.asset]?.price;
                    const margin = (pos.size * pos.entryPrice) / pos.leverage;
                    const notional = pos.size * pos.entryPrice;

                    let livePnl = 0;
                    let livePnlPct = 0;
                    if (pos.isLive && pos.unrealizedPnl != null) {
                      // Live: trust HL's unrealizedPnl
                      livePnl = pos.unrealizedPnl;
                      livePnlPct = margin > 0 ? (livePnl / margin) * 100 : 0;
                    } else if (mark != null) {
                      const priceDiff = pos.direction === "long"
                        ? mark - pos.entryPrice
                        : pos.entryPrice - mark;
                      livePnl = priceDiff * pos.size * pos.leverage;
                      livePnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
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
                        <td className="px-3 py-2">
                          <span className="font-bold font-mono" style={{ color: ASSETS[pos.asset]?.color }}>
                            {pos.asset}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-bold",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {pos.direction.toUpperCase()}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-right font-mono text-ninja-text">
                          ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="px-3 py-2 text-right font-mono text-ninja-muted">
                          {mark != null
                            ? `$${mark.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </td>

                        {/* Liq price (live) or SL/TP (paper) */}
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          {pos.isLive ? (
                            <span className="text-yellow-400">
                              {pos.liqPrice ? `$${pos.liqPrice.toFixed(2)}` : "—"}
                            </span>
                          ) : (
                            <>
                              <span className="text-ninja-red">${pos.stopLoss?.toFixed(2) ?? "—"}</span>
                              <span className="text-ninja-muted mx-1">/</span>
                              <span className="text-ninja-green">${pos.takeProfit?.toFixed(2) ?? "—"}</span>
                            </>
                          )}
                        </td>

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

                        <td className="px-3 py-2 text-right font-mono text-ninja-muted whitespace-nowrap">
                          ${margin.toFixed(2)}
                          <span className="text-ninja-muted/50 ml-1 text-xs">(${notional.toFixed(0)} notional)</span>
                        </td>

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

                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleClose(pos, exitPrice)}
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

      {/* History tab (paper trade log) */}
      {activeTab === "History" && (
        <>
          {recentTrades.length === 0 ? (
            <div className="px-4 py-5 text-center text-ninja-muted text-xs">
              {isLive
                ? "Live trade history is shown on Hyperliquid"
                : "No trades yet — run the auto trader or execute a trade"}
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
