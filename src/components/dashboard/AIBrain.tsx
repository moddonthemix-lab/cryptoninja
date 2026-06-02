"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Brain, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import type { Asset } from "@/types";
import { ASSETS } from "@/types";

const ASSETS_LIST: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function AIBrain() {
  const { aiSignals, setAISignal, aiEnabled, toggleAI, tradingMode } = useStore();
  const [loading, setLoading] = useState<Asset | null>(null);
  const [overview, setOverview] = useState<string>("");
  const [loadingOverview, setLoadingOverview] = useState(false);

  const analyzeAsset = async (asset: Asset) => {
    if (!aiEnabled) return;
    setLoading(asset);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset }),
      });
      const signal = await res.json();
      if (!signal.error) setAISignal(asset, signal);
    } finally {
      setLoading(null);
    }
  };

  const getOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch("/api/ai/analyze");
      const data = await res.json();
      setOverview(data.overview || "");
    } finally {
      setLoadingOverview(false);
    }
  };

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-ninja-accent" />
          <span className="font-bold text-sm text-ninja-text">AI Brain</span>
          <span className="text-xs text-ninja-muted">(Claude)</span>
        </div>
        <button
          onClick={toggleAI}
          className={cn(
            "text-xs px-2 py-1 rounded-lg border transition-all",
            aiEnabled
              ? "border-green-500/40 text-green-400 bg-green-500/10"
              : "border-ninja-border text-ninja-muted"
          )}
        >
          {aiEnabled ? "ON" : "OFF"}
        </button>
      </div>

      {/* Paper trading notice */}
      {tradingMode === "paper" && (
        <div className="text-xs text-yellow-400/70 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-3">
          📄 Paper trading — AI signals are for educational use only
        </div>
      )}

      {/* Asset analysis buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {ASSETS_LIST.map((asset) => {
          const signal = aiSignals[asset];
          const isLoading = loading === asset;
          return (
            <button
              key={asset}
              onClick={() => analyzeAsset(asset)}
              disabled={isLoading || !aiEnabled}
              className={cn(
                "relative flex flex-col items-start p-2 rounded-lg border transition-all text-left",
                signal
                  ? signal.direction === "long"
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-red-500/40 bg-red-500/5"
                  : "border-ninja-border hover:border-ninja-accent/50"
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="text-xs font-bold" style={{ color: ASSETS[asset].color }}>
                  {asset}
                </span>
                {isLoading && <RefreshCw size={10} className="animate-spin text-ninja-accent ml-auto" />}
                {signal && !isLoading && (
                  <span className="ml-auto">
                    {signal.direction === "long"
                      ? <TrendingUp size={10} className="text-ninja-green" />
                      : <TrendingDown size={10} className="text-ninja-red" />}
                  </span>
                )}
              </div>
              {signal && (
                <>
                  <span className={cn(
                    "text-xs font-bold mt-0.5",
                    signal.direction === "long" ? "text-ninja-green" : "text-ninja-red"
                  )}>
                    {signal.direction.toUpperCase()}
                  </span>
                  <span className="text-ninja-muted text-xs">{signal.confidence}% conf</span>
                </>
              )}
              {!signal && !isLoading && (
                <span className="text-ninja-muted text-xs mt-0.5">Tap to analyze</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Market overview */}
      <div className="flex-1 border-t border-ninja-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-ninja-muted">Market Overview</span>
          <button
            onClick={getOverview}
            disabled={loadingOverview}
            className="text-ninja-accent hover:text-ninja-accent-hover transition-colors"
          >
            <RefreshCw size={12} className={cn(loadingOverview && "animate-spin")} />
          </button>
        </div>
        {overview ? (
          <p className="text-ninja-text text-xs leading-relaxed">{overview}</p>
        ) : (
          <p className="text-ninja-muted text-xs">Click refresh for AI market overview</p>
        )}
      </div>

      {/* Risk disclaimer */}
      <div className="mt-3 flex items-start gap-1.5 text-xs text-ninja-muted/60">
        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
        <span>AI signals are not financial advice. Always manage risk.</span>
      </div>
    </div>
  );
}
