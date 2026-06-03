"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Brain, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap } from "lucide-react";
import type { Asset } from "@/types";
import { ASSETS } from "@/types";

const ASSETS_LIST: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function AIBrain() {
  const { aiSignals, setAISignal, aiEnabled, toggleAI, tradingMode } = useStore();
  const [loading, setLoading] = useState<Asset | null>(null);
  const [overview, setOverview] = useState<string>("");
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overview is loaded on demand (button) to conserve API credits — not auto.

  const analyzeAsset = async (asset: Asset) => {
    setLoading(asset);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset }),
      });
      const signal = await res.json();
      if (signal.error) {
        setError(signal.error);
      } else {
        setAISignal(asset, signal);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(null);
    }
  };

  const getOverview = async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze?overview=1");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setOverview(data.overview || "");
      }
    } catch (e: any) {
      setError("Failed to load: " + e.message);
    } finally {
      setLoadingOverview(false);
    }
  };

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-ninja-accent" />
          <span className="font-bold text-sm text-ninja-text">AI Brain</span>
          <span className="text-xs text-ninja-muted">(Claude)</span>
        </div>
        <button
          onClick={getOverview}
          disabled={loadingOverview}
          className="text-ninja-muted hover:text-ninja-accent transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={cn(loadingOverview && "animate-spin")} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
          ⚠️ {error}
        </div>
      )}

      {/* Paper trading notice */}
      {tradingMode === "paper" && (
        <div className="text-xs text-yellow-400/70 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-3">
          📄 Paper trading — AI signals are educational only
        </div>
      )}

      {/* Asset analysis buttons */}
      <p className="text-ninja-muted text-xs mb-2">Tap to analyze:</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {ASSETS_LIST.map((asset) => {
          const signal = aiSignals[asset];
          const isLoading = loading === asset;
          return (
            <button
              key={asset}
              onClick={() => analyzeAsset(asset)}
              disabled={isLoading}
              className={cn(
                "relative flex flex-col items-start p-2.5 rounded-lg border transition-all text-left cursor-pointer",
                signal
                  ? signal.direction === "long"
                    ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10"
                    : "border-red-500/50 bg-red-500/5 hover:bg-red-500/10"
                  : "border-ninja-border hover:border-ninja-accent/70 hover:bg-ninja-accent/5",
                isLoading && "opacity-70"
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="text-xs font-bold" style={{ color: ASSETS[asset].color }}>
                  {asset}
                </span>
                {isLoading && (
                  <RefreshCw size={10} className="animate-spin text-ninja-accent ml-auto" />
                )}
                {signal && !isLoading && (
                  <span className="ml-auto">
                    {signal.direction === "long"
                      ? <TrendingUp size={10} className="text-ninja-green" />
                      : <TrendingDown size={10} className="text-ninja-red" />}
                  </span>
                )}
              </div>
              {signal && !isLoading ? (
                <>
                  <span className={cn(
                    "text-xs font-bold mt-0.5",
                    signal.direction === "long" ? "text-ninja-green" : "text-ninja-red"
                  )}>
                    {signal.direction.toUpperCase()}
                  </span>
                  <span className="text-ninja-muted text-xs">{signal.confidence}% conf</span>
                </>
              ) : isLoading ? (
                <span className="text-ninja-muted text-xs mt-0.5">Analyzing...</span>
              ) : (
                <span className="text-ninja-muted text-xs mt-0.5">Click to analyze</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Market overview */}
      <div className="flex-1 border-t border-ninja-border pt-3 overflow-hidden">
        <div className="text-xs text-ninja-muted mb-2 font-semibold uppercase tracking-wide">Market Overview</div>
        {loadingOverview ? (
          <div className="flex items-center gap-2 text-ninja-muted text-xs">
            <RefreshCw size={11} className="animate-spin" /> Loading...
          </div>
        ) : overview ? (
          <p className="text-ninja-text text-xs leading-relaxed">{overview}</p>
        ) : (
          <p className="text-ninja-muted text-xs">Tap an asset above to get AI analysis</p>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-3 flex items-start gap-1.5 text-xs text-ninja-muted/60">
        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
        <span>AI signals are not financial advice. Always manage risk.</span>
      </div>
    </div>
  );
}
