"use client";

import { useState, useEffect } from "react";
import { TradingChart } from "./TradingChart";
import { useStore } from "@/store/useStore";
import type { Asset, Candle } from "@/types";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";
import { RefreshCw, Brain } from "lucide-react";

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1D", value: "1d" },
];

const ALL_ASSETS: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function ChartsContent() {
  const { selectedAsset, setSelectedAsset, marketData, aiSignals } = useStore();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [timeframe, setTimeframe] = useState("1h");
  const [loading, setLoading] = useState(false);

  const loadCandles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market/${selectedAsset}?interval=${timeframe}&limit=200`);
      const data = await res.json();
      setCandles(data.candles || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandles();
    const id = window.setInterval(loadCandles, 30000);
    return () => window.clearInterval(id);
  }, [selectedAsset, timeframe]);

  const aiSignal = aiSignals[selectedAsset];
  const price = marketData[selectedAsset]?.price;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ninja-text">Charts</h1>
        <button
          onClick={loadCandles}
          disabled={loading}
          className="flex items-center gap-2 text-ninja-muted hover:text-ninja-text transition-colors text-sm"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Asset selector */}
      <div className="flex gap-2">
        {ALL_ASSETS.map((asset) => {
          const data = marketData[asset];
          const up = (data?.changePercent24h ?? 0) >= 0;
          return (
            <button
              key={asset}
              onClick={() => setSelectedAsset(asset)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                selectedAsset === asset
                  ? "border-ninja-accent bg-ninja-accent/10 text-ninja-accent"
                  : "border-ninja-border bg-ninja-card text-ninja-muted hover:border-ninja-accent/50"
              )}
            >
              <span className="font-bold text-sm" style={{ color: ASSETS[asset].color }}>
                {asset}
              </span>
              {data && (
                <span className={cn("text-xs", up ? "text-ninja-green" : "text-ninja-red")}>
                  {up ? "+" : ""}{data.changePercent24h.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Interval selector */}
      <div className="flex gap-1">
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            onClick={() => setTimeframe(i.value)}
            className={cn(
              "px-3 py-1 rounded text-xs font-mono transition-all",
              timeframe === i.value
                ? "bg-ninja-accent text-white"
                : "bg-ninja-card border border-ninja-border text-ninja-muted hover:text-ninja-text"
            )}
          >
            {i.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <TradingChart
        asset={selectedAsset}
        candles={candles}
        currentPrice={price}
        entryPrice={aiSignal?.suggestedEntry}
        stopLoss={aiSignal?.suggestedSL}
        takeProfit={aiSignal?.suggestedTP}
        height={500}
      />

      {/* AI Signal overlay */}
      {aiSignal && (
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={16} className="text-ninja-accent" />
            <span className="font-bold text-sm text-ninja-text">AI Signal for {selectedAsset}</span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-bold",
              aiSignal.direction === "long"
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            )}>
              {aiSignal.direction.toUpperCase()}
            </span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full ml-auto",
              aiSignal.confidence >= 70
                ? "bg-green-500/20 text-green-400"
                : aiSignal.confidence >= 50
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-red-500/20 text-red-400"
            )}>
              {aiSignal.confidence}% confidence
            </span>
          </div>
          <p className="text-ninja-muted text-sm">{aiSignal.reasoning}</p>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {aiSignal.suggestedEntry && (
              <div className="text-center">
                <div className="text-ninja-accent text-xs">Entry</div>
                <div className="font-mono text-sm">${aiSignal.suggestedEntry.toFixed(2)}</div>
              </div>
            )}
            {aiSignal.suggestedSL && (
              <div className="text-center">
                <div className="text-ninja-red text-xs">Stop Loss</div>
                <div className="font-mono text-sm">${aiSignal.suggestedSL.toFixed(2)}</div>
              </div>
            )}
            {aiSignal.suggestedTP && (
              <div className="text-center">
                <div className="text-ninja-green text-xs">Take Profit</div>
                <div className="font-mono text-sm">${aiSignal.suggestedTP.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
