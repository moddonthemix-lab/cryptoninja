"use client";

import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, Activity, BarChart2, Target } from "lucide-react";

export function StatsGrid() {
  const { paperBalance, openPositions, closedTrades, tradingMode, activeStrategyId, strategies } = useStore();

  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const totalClosed = closedTrades.length;
  const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const activeStrategy = strategies.find((s) => s.id === activeStrategyId);

  const stats = [
    {
      label: tradingMode === "paper" ? "Paper Balance" : "Balance",
      value: `$${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: Wallet,
      color: "text-ninja-accent",
      bg: "bg-ninja-accent/10",
    },
    {
      label: "Total PnL",
      value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`,
      icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
      color: totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red",
      bg: totalPnl >= 0 ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      icon: Target,
      color: winRate >= 50 ? "text-ninja-green" : "text-ninja-red",
      bg: winRate >= 50 ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      label: "Open Positions",
      value: openPositions.filter((p) => p.isOpen).length.toString(),
      icon: Activity,
      color: "text-ninja-yellow",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Total Trades",
      value: totalClosed.toString(),
      icon: BarChart2,
      color: "text-ninja-muted",
      bg: "bg-ninja-border/30",
    },
    {
      label: "Active Strategy",
      value: activeStrategy?.name ?? "None",
      icon: Activity,
      color: activeStrategy ? "text-ninja-green" : "text-ninja-muted",
      bg: activeStrategy ? "bg-green-500/10" : "bg-ninja-border/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-ninja-card border border-ninja-border rounded-xl p-3"
        >
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center mb-2", s.bg)}>
            <s.icon size={14} className={s.color} />
          </div>
          <div className={cn("font-bold text-sm font-mono truncate", s.color)}>{s.value}</div>
          <div className="text-ninja-muted text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
