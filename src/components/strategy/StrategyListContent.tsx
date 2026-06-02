"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Strategy } from "@/types";
import { cn } from "@/lib/utils";
import { Plus, Play, Pause, Trash2, Zap, Brain } from "lucide-react";
import Link from "next/link";
import { ASSETS } from "@/types";

export function StrategyListContent() {
  const { strategies, setStrategies, setActiveStrategy, activeStrategyId } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strategies")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStrategies(data);
      })
      .finally(() => setLoading(false));
  }, [setStrategies]);

  const toggleActive = (id: string) => {
    setActiveStrategy(activeStrategyId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ninja-text">Strategies</h1>
          <p className="text-ninja-muted text-sm mt-0.5">Define your trading method, AI executes it</p>
        </div>
        <Link
          href="/strategy/builder"
          className="flex items-center gap-2 bg-ninja-accent hover:bg-ninja-accent-hover text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
        >
          <Plus size={16} />
          New Strategy
        </Link>
      </div>

      {/* Example strategy card to guide users */}
      <div className="bg-ninja-accent/5 border border-ninja-accent/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Brain size={18} className="text-ninja-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ninja-text font-semibold mb-1">Example Strategy</p>
            <p className="text-xs text-ninja-muted leading-relaxed">
              "When BTC breaks above resistance, RSI &gt; 50, volume increasing → Long 3x, 1.5% SL, 3% TP, risk 1% of balance"
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-ninja-muted">Loading strategies...</div>
      ) : strategies.length === 0 ? (
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-12 text-center">
          <Zap size={32} className="text-ninja-accent mx-auto mb-3 opacity-50" />
          <p className="text-ninja-muted text-sm mb-4">No strategies yet</p>
          <Link
            href="/strategy/builder"
            className="inline-flex items-center gap-2 bg-ninja-accent hover:bg-ninja-accent-hover text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          >
            <Plus size={16} /> Create Your First Strategy
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              isActive={activeStrategyId === strategy.id}
              onToggle={() => toggleActive(strategy.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  strategy,
  isActive,
  onToggle,
}: {
  strategy: Strategy;
  isActive: boolean;
  onToggle: () => void;
}) {
  const assetConfig = ASSETS[strategy.asset];

  return (
    <div
      className={cn(
        "bg-ninja-card border rounded-xl p-4 transition-all",
        isActive ? "border-ninja-accent shadow-lg shadow-ninja-accent/10" : "border-ninja-border"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-ninja-text">{strategy.name}</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ color: assetConfig.color, background: `${assetConfig.color}20` }}
            >
              {strategy.asset}
            </span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              strategy.direction === "long"
                ? "bg-green-500/20 text-green-400"
                : strategy.direction === "short"
                ? "bg-red-500/20 text-red-400"
                : "bg-ninja-border text-ninja-muted"
            )}>
              {strategy.direction.toUpperCase()}
            </span>
            {strategy.aiEnabled && (
              <span className="text-xs bg-ninja-accent/20 text-ninja-accent border border-ninja-accent/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Brain size={10} /> AI
              </span>
            )}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full ml-auto",
              strategy.mode === "paper"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-green-500/20 text-green-400"
            )}>
              {strategy.mode.toUpperCase()}
            </span>
          </div>

          {strategy.description && (
            <p className="text-ninja-muted text-xs mb-2">{strategy.description}</p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-ninja-muted">
            <span>⚡ {strategy.leverage}x leverage</span>
            <span className="text-ninja-red">🛑 SL {strategy.stopLoss}%</span>
            <span className="text-ninja-green">🎯 TP {strategy.takeProfit}%</span>
            <span>📏 {strategy.positionSize}{strategy.positionSizeType === "percent" ? "%" : " USD"}</span>
            <span>🔄 {strategy.conditions.length} conditions</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onToggle}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
              isActive
                ? "bg-ninja-accent/20 text-ninja-accent border-ninja-accent/40 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40"
                : "bg-ninja-border/30 text-ninja-muted border-ninja-border hover:border-ninja-accent/40 hover:text-ninja-accent"
            )}
          >
            {isActive ? <><Pause size={12} /> Running</> : <><Play size={12} /> Start</>}
          </button>
        </div>
      </div>
    </div>
  );
}
