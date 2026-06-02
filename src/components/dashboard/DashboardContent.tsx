"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { TradingChart } from "@/components/chart/TradingChart";
import { StatsGrid } from "./StatsGrid";
import { PositionsTable } from "./PositionsTable";
import { AIBrain } from "./AIBrain";
import { MarketTicker } from "./MarketTicker";
import type { Asset, Candle } from "@/types";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const ALL_ASSETS: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

const TIMEFRAMES = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1D", value: "1d" },
];

export function DashboardContent() {
  const { selectedAsset, setSelectedAsset, marketData, openPositions, aiSignals } = useStore();
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

  const price = marketData[selectedAsset]?.price;
  const change = marketData[selectedAsset]?.changePercent24h ?? 0;
  const aiSignal = aiSignals[selectedAsset];
  const activePos = openPositions.find((p) => p.asset === selectedAsset && p.isOpen);

  return (
    <div className="space-y-4">
      {/* Market data poller */}
      <MarketTicker />

      {/* Asset selector tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {ALL_ASSETS.map((asset) => {
          const data = marketData[asset];
          const up = (data?.changePercent24h ?? 0) >= 0;
          const isSelected = selectedAsset === asset;
          return (
            <button
              key={asset}
              onClick={() => setSelectedAsset(asset)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                isSelected
                  ? "border-ninja-accent bg-ninja-accent/10"
                  : "border-ninja-border bg-ninja-card hover:border-ninja-accent/40"
              )}
            >
              <span className="font-bold text-sm" style={{ color: ASSETS[asset].color }}>
                {asset}
              </span>
              {data && (
                <>
                  <span className="text-ninja-text text-xs font-mono">
                    ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={cn("text-xs font-mono", up ? "text-ninja-green" : "text-ninja-red")}>
                    {up ? "+" : ""}{data.changePercent24h.toFixed(2)}%
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <StatsGrid />

      {/* Main trading area */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Chart — takes 3/4 */}
        <div className="xl:col-span-3 space-y-2">
          {/* Timeframe selector */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={cn(
                    "px-3 py-1 rounded text-xs font-mono transition-all",
                    timeframe === tf.value
                      ? "bg-ninja-accent text-white"
                      : "bg-ninja-card border border-ninja-border text-ninja-muted hover:text-ninja-text"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <button
              onClick={loadCandles}
              disabled={loading}
              className="text-ninja-muted hover:text-ninja-text transition-colors text-xs flex items-center gap-1"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin")} />
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <TradingChart
            asset={selectedAsset}
            candles={candles}
            currentPrice={price}
            entryPrice={activePos?.entryPrice ?? aiSignal?.suggestedEntry}
            stopLoss={activePos?.stopLoss ?? aiSignal?.suggestedSL}
            takeProfit={activePos?.takeProfit ?? aiSignal?.suggestedTP}
            height={460}
          />

          {/* AI signal bar under chart */}
          {aiSignal && (
            <div className={cn(
              "rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap",
              aiSignal.direction === "long"
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <span className={cn(
                "font-bold text-sm px-2 py-0.5 rounded",
                aiSignal.direction === "long"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                AI: {aiSignal.direction.toUpperCase()}
              </span>
              <span className="text-ninja-muted text-xs">{aiSignal.confidence}% confidence</span>
              {aiSignal.suggestedEntry && (
                <span className="text-xs"><span className="text-ninja-accent">Entry</span> ${aiSignal.suggestedEntry.toFixed(2)}</span>
              )}
              {aiSignal.suggestedSL && (
                <span className="text-xs"><span className="text-ninja-red">SL</span> ${aiSignal.suggestedSL.toFixed(2)}</span>
              )}
              {aiSignal.suggestedTP && (
                <span className="text-xs"><span className="text-ninja-green">TP</span> ${aiSignal.suggestedTP.toFixed(2)}</span>
              )}
              <span className="text-ninja-muted text-xs ml-auto hidden lg:block">{aiSignal.reasoning}</span>
            </div>
          )}
        </div>

        {/* AI Brain — takes 1/4 */}
        <div className="xl:col-span-1">
          <AIBrain />
        </div>
      </div>

      {/* Positions & Trade History */}
      <PositionsTable />
    </div>
  );
}
