"use client";

import { useEffect, useState } from "react";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn } from "@/lib/utils";

// Live account stats from Hyperliquid (equity, realized PnL, win rate, trades).
export function StatsGrid() {
  const { totalBalance, livePositions } = useHyperliquid();
  const [wr, setWr] = useState<{ winRate: number; trades: number; realized: number } | null>(null);

  useEffect(() => {
    const load = () => fetch("/api/hl/winrate").then((r) => r.json())
      .then((d) => { if (!d.error) setWr(d); }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const realized = wr?.realized ?? 0;
  const winRate = wr?.winRate ?? 0;
  const trades = wr?.trades ?? 0;

  const stats = [
    { label: "Equity", value: `$${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "text-ninja-accent" },
    { label: "Realized PnL", value: `${realized >= 0 ? "+" : "-"}$${Math.abs(realized).toFixed(2)}`, color: realized >= 0 ? "text-ninja-green" : "text-ninja-red" },
    { label: "Win Rate", value: wr ? `${winRate.toFixed(1)}%` : "—", color: winRate >= 50 ? "text-ninja-green" : "text-yellow-400" },
    { label: "Open", value: livePositions.length.toString(), color: "text-yellow-400" },
    { label: "Trades", value: wr ? trades.toString() : "—", color: "text-ninja-muted" },
    { label: "Mode", value: "LIVE", color: "text-ninja-green" },
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
