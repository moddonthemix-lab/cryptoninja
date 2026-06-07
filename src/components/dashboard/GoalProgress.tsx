"use client";

import { useHyperliquid } from "@/hooks/useHyperliquid";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

const GOAL = 1000;

export function GoalProgress() {
  const { totalBalance } = useHyperliquid();
  const { tradingMode, paperBalance } = useStore();
  const equity = tradingMode === "live" ? totalBalance : paperBalance;
  if (!equity || equity <= 0) return null;

  const pct = Math.max(0, Math.min(100, (equity / GOAL) * 100));
  const reached = equity >= GOAL;

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-bold text-ninja-text">
          <Target size={13} className="text-ninja-accent" /> Goal — $1,000
        </span>
        <span className="font-mono text-ninja-muted">
          ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className={cn("ml-1 font-bold", reached ? "text-ninja-green" : "text-ninja-accent")}>({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-ninja-border overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", reached ? "bg-ninja-green" : "bg-ninja-accent")} style={{ width: `${pct}%` }} />
      </div>
      {reached && <div className="text-[11px] text-ninja-green font-bold">🎯 Goal reached — set a new target!</div>}
    </div>
  );
}
