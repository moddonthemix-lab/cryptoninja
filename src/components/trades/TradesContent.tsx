"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Trade } from "@/types";
import { ASSETS } from "@/types";
import { cn, formatPnl, timeAgo } from "@/lib/utils";
import { TrendingUp, TrendingDown, Filter } from "lucide-react";

export function TradesContent() {
  const { closedTrades, setTrades, tradingMode } = useStore();
  const [filter, setFilter] = useState<"all" | "long" | "short" | "win" | "loss">("all");

  useEffect(() => {
    fetch("/api/trades?limit=100")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrades(data);
      });
  }, [setTrades]);

  const filtered = closedTrades.filter((t) => {
    if (filter === "long") return t.direction === "long";
    if (filter === "short") return t.direction === "short";
    if (filter === "win") return (t.pnl ?? 0) > 0;
    if (filter === "loss") return (t.pnl ?? 0) < 0;
    return true;
  });

  const totalPnl = filtered.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = filtered.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ninja-text">Trade History</h1>
        <span className={cn(
          "text-xs px-2 py-1 rounded-full font-bold",
          tradingMode === "paper" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"
        )}>
          {tradingMode.toUpperCase()} MODE
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className={cn("text-lg font-bold font-mono", totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
            {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(2)}
          </div>
          <div className="text-ninja-muted text-xs">Total PnL</div>
        </div>
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className={cn("text-lg font-bold", winRate >= 50 ? "text-ninja-green" : "text-ninja-red")}>
            {winRate.toFixed(1)}%
          </div>
          <div className="text-ninja-muted text-xs">Win Rate</div>
        </div>
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-ninja-text">{filtered.length}</div>
          <div className="text-ninja-muted text-xs">Total Trades</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-ninja-muted" />
        {(["all", "long", "short", "win", "loss"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all border",
              filter === f
                ? "bg-ninja-accent/20 text-ninja-accent border-ninja-accent/40"
                : "border-ninja-border text-ninja-muted hover:border-ninja-accent/40"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-ninja-muted text-sm">
            No trades yet — activate a strategy to start trading
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-ninja-border bg-ninja-border/10">
                <tr className="text-ninja-muted">
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-left px-4 py-3">Side</th>
                  <th className="text-right px-4 py-3">Entry</th>
                  <th className="text-right px-4 py-3">Exit</th>
                  <th className="text-right px-4 py-3">Lev</th>
                  <th className="text-right px-4 py-3">Size</th>
                  <th className="text-right px-4 py-3">PnL</th>
                  <th className="text-right px-4 py-3">PnL %</th>
                  <th className="text-right px-4 py-3">Reason</th>
                  <th className="text-right px-4 py-3">Mode</th>
                  <th className="text-right px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade) => (
                  <TradeRow key={trade.id} trade={trade} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const pnl = trade.pnl ?? 0;
  const isWin = pnl > 0;

  return (
    <tr className="border-b border-ninja-border/30 hover:bg-ninja-border/10 transition-colors">
      <td className="px-4 py-3">
        <span className="font-bold" style={{ color: ASSETS[trade.asset]?.color ?? "#fff" }}>
          {trade.asset}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "px-2 py-0.5 rounded font-bold",
          trade.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        )}>
          {trade.direction === "long" ? "↑" : "↓"} {trade.direction.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono">${trade.entryPrice.toFixed(2)}</td>
      <td className="px-4 py-3 text-right font-mono">${trade.exitPrice?.toFixed(2) ?? "—"}</td>
      <td className="px-4 py-3 text-right font-mono text-ninja-muted">{trade.leverage}x</td>
      <td className="px-4 py-3 text-right font-mono text-ninja-muted">{trade.size.toFixed(4)}</td>
      <td className="px-4 py-3 text-right font-mono">
        <span className={isWin ? "text-ninja-green" : "text-ninja-red"}>
          {formatPnl(pnl)}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono">
        <span className={isWin ? "text-ninja-green" : "text-ninja-red"}>
          {(trade.pnlPercent ?? 0) >= 0 ? "+" : ""}{(trade.pnlPercent ?? 0).toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="uppercase text-ninja-muted text-xs px-2 py-0.5 bg-ninja-border/30 rounded">
          {trade.closeReason ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded",
          trade.mode === "paper" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"
        )}>
          {trade.mode}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-ninja-muted">
        {timeAgo(trade.closedAt ?? trade.openedAt)}
      </td>
    </tr>
  );
}
