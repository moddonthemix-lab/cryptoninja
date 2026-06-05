"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn, timeAgo } from "@/lib/utils";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { X, Share2 } from "lucide-react";
import { ShareCard, type SharePosition } from "./ShareCard";

type Tab = "Positions" | "Orders" | "History";

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
  const { livePositions, closeLivePosition, setTpSl, triggers, openOrders, cancelOrderByCoin } = useHyperliquid();
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Positions");
  const [closing, setClosing] = useState<string | null>(null);
  const [sharePos, setSharePos] = useState<SharePosition | null>(null);
  const [tpslPos, setTpslPos] = useState<DisplayPosition | null>(null);
  const [tpInput, setTpInput] = useState("");
  const [slInput, setSlInput] = useState("");
  const [tpslSaving, setTpslSaving] = useState(false);
  const [tpslErr, setTpslErr] = useState<string | null>(null);

  const isLive = tradingMode === "live";

  const openTpslEditor = (pos: DisplayPosition) => {
    setTpInput(pos.takeProfit ? String(pos.takeProfit) : "");
    setSlInput(pos.stopLoss ? String(pos.stopLoss) : "");
    setTpslErr(null);
    setTpslPos(pos);
  };

  const saveTpsl = async () => {
    if (!tpslPos) return;
    setTpslSaving(true);
    setTpslErr(null);
    try {
      await setTpSl({
        asset: tpslPos.asset,
        positionIsLong: tpslPos.direction === "long",
        size: tpslPos.size,
        takeProfit: tpInput ? parseFloat(tpInput) : null,
        stopLoss: slInput ? parseFloat(slInput) : null,
      });
      setTpslPos(null);
    } catch (e: any) {
      setTpslErr(e.message);
    } finally {
      setTpslSaving(false);
    }
  };

  // Build the display list from the right source
  const positions: DisplayPosition[] = isLive
    ? livePositions.map((p) => {
        const szi = parseFloat(p.szi);
        const trig = triggers[p.coin] ?? {};
        return {
          id: p.coin,
          asset: p.coin.replace(/^xyz:/, "") as Asset,
          direction: szi >= 0 ? "long" : "short",
          size: Math.abs(szi),
          entryPrice: parseFloat(p.entryPx),
          leverage: p.leverage?.value ?? 1,
          stopLoss: trig.sl ?? null,
          takeProfit: trig.tp ?? null,
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

  const handleCancel = async (coin: string, oid: number) => {
    setCancelling(oid);
    try { await cancelOrderByCoin(coin, oid); } catch { /* surfaced via hook */ }
    setTimeout(() => setCancelling(null), 400);
  };

  // Resting (non-trigger) limit orders + trigger orders, for the Orders tab
  const restingOrders = openOrders.filter((o) => o && o.oid);

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-lg">
      {/* Tab header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ninja-border/60">
        {(["Positions", "Orders", "History"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-bold transition-all duration-200",
              activeTab === tab
                ? "bg-ninja-accent text-white shadow-lg shadow-ninja-accent/20"
                : "text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/40"
            )}
          >
            {tab}
            {tab === "Orders" && restingOrders.length > 0 && (
              <span className={cn(
                "ml-1.5 px-1 py-0.5 rounded text-xs",
                activeTab === tab ? "bg-white/20 text-white" : "bg-ninja-accent/20 text-ninja-accent"
              )}>
                {restingOrders.length}
              </span>
            )}
            {tab === "Positions" && positions.length > 0 && (
              <span className={cn(
                "ml-1.5 px-1 py-0.5 rounded text-xs",
                activeTab === tab ? "bg-white/20 text-white" : "bg-ninja-accent/20 text-ninja-accent"
              )}>
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
                    <th className="text-right px-3 py-2">SL / TP</th>
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

                        {/* SL / TP (from triggers for live) — Liq shown if neither set */}
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          {pos.isLive && !pos.stopLoss && !pos.takeProfit ? (
                            <span className="text-yellow-400" title="Liquidation price">
                              {pos.liqPrice ? `liq $${pos.liqPrice.toFixed(2)}` : "—"}
                            </span>
                          ) : (
                            <>
                              <span className="text-ninja-red">{pos.stopLoss ? `$${pos.stopLoss.toFixed(2)}` : "—"}</span>
                              <span className="text-ninja-muted mx-1">/</span>
                              <span className="text-ninja-green">{pos.takeProfit ? `$${pos.takeProfit.toFixed(2)}` : "—"}</span>
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
                          <div className="flex items-center gap-1.5 justify-end">
                            {pos.isLive && (
                              <button
                                onClick={() => openTpslEditor(pos)}
                                title="Set / edit TP & SL"
                                className="flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-yellow-500/60 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all text-xs font-bold"
                              >
                                TP/SL
                              </button>
                            )}
                            <button
                              onClick={() => setSharePos({
                                asset: pos.asset, direction: pos.direction, leverage: pos.leverage,
                                entryPrice: pos.entryPrice, markPrice: mark ?? pos.entryPrice, pnlPct: livePnlPct,
                              })}
                              title="Share PnL card"
                              className="flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-ninja-accent/60 hover:text-ninja-accent hover:bg-ninja-accent/10 transition-all text-xs font-bold"
                            >
                              <Share2 size={10} />
                            </button>
                            <button
                              onClick={() => handleClose(pos, exitPrice)}
                              disabled={isClosing}
                              title="Close position at market price"
                              className="flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
                            >
                              <X size={10} />
                              Close
                            </button>
                          </div>
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

      {/* Orders tab — resting limit + trigger orders on Hyperliquid */}
      {activeTab === "Orders" && (
        <>
          {restingOrders.length === 0 ? (
            <div className="px-4 py-5 text-center text-ninja-muted text-xs">
              {isLive ? "No open orders" : "Open orders show in Live mode"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ninja-muted border-b border-ninja-border/60 uppercase tracking-wide">
                    <th className="text-left px-3 py-2">Asset</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-right px-3 py-2">Size</th>
                    <th className="text-right px-3 py-2">Price / Trigger</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {restingOrders.map((o) => {
                    const ticker = String(o.coin).replace(/^xyz:/, "");
                    const isBuy = o.side === "B";
                    const isTrigger = o.isTrigger;
                    const orderType = o.orderType || (isTrigger ? "Trigger" : "Limit");
                    const px = isTrigger ? parseFloat(o.triggerPx) : parseFloat(o.limitPx);
                    const typeColor = /take profit/i.test(orderType) ? "text-ninja-green"
                      : /stop/i.test(orderType) ? "text-ninja-red"
                      : "text-ninja-accent";
                    const isCancelling = cancelling === o.oid;
                    return (
                      <tr
                        key={o.oid}
                        className={cn(
                          "border-b border-ninja-border/40 hover:bg-ninja-border/20 transition-opacity",
                          isBuy ? "border-l-2 border-l-green-500/70" : "border-l-2 border-l-red-500/70",
                          isCancelling && "opacity-40"
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className="font-bold font-mono" style={{ color: ASSETS[ticker]?.color }}>{ticker}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("px-1.5 py-0.5 rounded font-bold", isBuy ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td className={cn("px-3 py-2 font-medium", typeColor)}>
                          {orderType}{o.reduceOnly ? " · RO" : ""}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ninja-text">{parseFloat(o.sz)}</td>
                        <td className="px-3 py-2 text-right font-mono text-ninja-text">
                          ${px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: px < 1 ? 5 : 2 })}
                          {isTrigger && o.triggerCondition && (
                            <span className="text-ninja-muted/50 ml-1 text-[10px]">{o.triggerCondition}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleCancel(o.coin, o.oid)}
                            disabled={isCancelling}
                            title="Cancel order"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
                          >
                            <X size={10} /> Cancel
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
                          <span className="font-bold font-mono" style={{ color: ASSETS[trade.asset]?.color }} title={trade.note ? `Why: ${trade.note}` : undefined}>
                            {trade.asset}
                          </span>
                          {trade.confidence != null && (
                            <span className="text-ninja-muted/50 ml-1 text-[10px]">{trade.confidence}%</span>
                          )}
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
                        <td className="px-3 py-2 text-right text-ninja-muted whitespace-nowrap">
                          <span className="mr-2">{timeAgo(trade.closedAt ?? trade.openedAt)}</span>
                          <button
                            onClick={() => setSharePos({
                              asset: trade.asset, direction: trade.direction, leverage: trade.leverage,
                              entryPrice: trade.entryPrice, markPrice: trade.exitPrice ?? trade.entryPrice, pnlPct,
                            })}
                            title="Share PnL card"
                            className="inline-flex items-center px-1.5 py-1 rounded border border-ninja-border text-ninja-muted hover:border-ninja-accent/60 hover:text-ninja-accent transition-all"
                          >
                            <Share2 size={10} />
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

      {sharePos && <ShareCard position={sharePos} onClose={() => setSharePos(null)} />}

      {/* TP/SL editor for live positions */}
      {tpslPos && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setTpslPos(null)}
        >
          <div
            className="bg-ninja-card border border-ninja-border rounded-2xl p-5 w-full max-w-xs space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ninja-text">
                TP / SL · <span style={{ color: ASSETS[tpslPos.asset]?.color }}>{tpslPos.asset}</span>{" "}
                <span className={tpslPos.direction === "long" ? "text-ninja-green" : "text-ninja-red"}>
                  {tpslPos.direction.toUpperCase()}
                </span>
              </span>
              <button onClick={() => setTpslPos(null)} className="text-ninja-muted hover:text-ninja-text">
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-ninja-muted">
              Entry ${tpslPos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} · Size {tpslPos.size}
            </div>

            <div>
              <label className="text-xs text-ninja-green font-bold mb-1 block">Take Profit price</label>
              <input
                type="number" value={tpInput} onChange={(e) => setTpInput(e.target.value)}
                placeholder="e.g. 0.00" className="input"
              />
            </div>
            <div>
              <label className="text-xs text-ninja-red font-bold mb-1 block">Stop Loss price</label>
              <input
                type="number" value={slInput} onChange={(e) => setSlInput(e.target.value)}
                placeholder="e.g. 0.00" className="input"
              />
            </div>

            {tpslErr && <div className="text-xs text-red-400">{tpslErr}</div>}

            <button
              onClick={saveTpsl}
              disabled={tpslSaving || (!tpInput && !slInput)}
              className="w-full py-2.5 rounded-lg bg-ninja-accent hover:bg-ninja-accent-hover text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {tpslSaving ? "Submitting…" : "Set TP / SL"}
            </button>
            <p className="text-ninja-muted/60 text-xs">
              Submits reduce-only trigger orders on Hyperliquid. Leave a field blank to skip it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
