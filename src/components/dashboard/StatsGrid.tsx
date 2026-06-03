"use client";

import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

export function StatsGrid() {
  const { paperBalance, openPositions, closedTrades, tradingMode, activeStrategyId, strategies } = useStore();

  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalClosed = closedTrades.length;
  const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const activeStrategy = strategies.find((s) => s.id === activeStrategyId);

  const stats = [
    {
      label: tradingMode === "paper" ? "Paper Bal" : "Balance",
      value: `$${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      color: "text-ninja-accent",
    },
    {
      label: "PnL",
      value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`,
      color: totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      color: winRate >= 50 ? "text-ninja-green" : "text-ninja-red",
    },
    {
      label: "Open",
      value: openPositions.filter((p) => p.isOpen).length.toString(),
      color: "text-ninja-yellow",
    },
    {
      label: "Trades",
      value: totalClosed.toString(),
      color: "text-ninja-muted",
    },
    {
      label: "Strategy",
      value: activeStrategy?.name ?? "None",
      color: activeStrategy ? "text-ninja-green" : "text-ninja-muted",
    },
  ];

  return (
    <div className="flex items-center gap-0 bg-ninja-card border border-ninja-border rounded-lg overflow-x-auto flex-shrink-0">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "flex items-center gap-2 px-3 py-2 flex-shrink-0",
            i < stats.length - 1 && "border-r border-ninja-border/60"
          )}
        >
          <span className="text-ninja-muted text-xs whitespace-nowrap">{s.label}</span>
          <span className={cn("font-mono font-bold text-xs whitespace-nowrap", s.color)}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}
