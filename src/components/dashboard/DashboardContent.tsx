"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { TradingViewWidget } from "@/components/chart/TradingViewWidget";
import { StatsGrid } from "./StatsGrid";
import { PositionsTable } from "./PositionsTable";
import { MarketTicker } from "./MarketTicker";
import { RightPanel } from "./RightPanel";
import type { Asset } from "@/types";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";

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
  const [timeframe, setTimeframe] = useState("1h");

  const aiSignal = aiSignals[selectedAsset];
  const activePos = openPositions.find((p) => p.asset === selectedAsset && p.isOpen);

  return (
    <div className="space-y-3">
      <MarketTicker />

      {/* Asset tabs + inline stats bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_ASSETS.map((asset) => {
            const data = marketData[asset];
            const up = (data?.changePercent24h ?? 0) >= 0;
            const isSelected = selectedAsset === asset;
            return (
              <button
                key={asset}
                onClick={() => setSelectedAsset(asset)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all",
                  isSelected
                    ? "border-ninja-accent bg-ninja-accent/10"
                    : "border-ninja-border bg-ninja-card hover:border-ninja-accent/40"
                )}
              >
                <span className="font-bold text-xs" style={{ color: ASSETS[asset].color }}>
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

        <StatsGrid />
      </div>

      {/* Main grid: chart 3 cols, right panel 1 col */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3" style={{ minHeight: 0 }}>

        {/* Chart column */}
        <div className="xl:col-span-3 flex flex-col gap-2">
          {/* Timeframe selector */}
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

          {/* TradingView chart */}
          <TradingViewWidget
            asset={selectedAsset}
            timeframe={timeframe}
            height={520}
            entryPrice={activePos?.entryPrice ?? aiSignal?.suggestedEntry}
            stopLoss={activePos?.stopLoss ?? aiSignal?.suggestedSL}
            takeProfit={activePos?.takeProfit ?? aiSignal?.suggestedTP}
          />

          {/* AI signal bar — compact one-liner */}
          {aiSignal && (
            <div className={cn(
              "rounded-lg border px-3 py-2 flex items-center gap-3 flex-wrap text-xs",
              aiSignal.direction === "long"
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <span className={cn(
                "font-bold px-2 py-0.5 rounded",
                aiSignal.direction === "long"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                AI: {aiSignal.direction.toUpperCase()}
              </span>
              <span className="text-ninja-muted">{aiSignal.confidence}% conf</span>
              {aiSignal.suggestedEntry && (
                <span className="font-mono">
                  <span className="text-ninja-accent">Entry</span> ${aiSignal.suggestedEntry.toFixed(2)}
                </span>
              )}
              {aiSignal.suggestedSL && (
                <span className="font-mono">
                  <span className="text-ninja-red">SL</span> ${aiSignal.suggestedSL.toFixed(2)}
                </span>
              )}
              {aiSignal.suggestedTP && (
                <span className="font-mono">
                  <span className="text-ninja-green">TP</span> ${aiSignal.suggestedTP.toFixed(2)}
                </span>
              )}
              <span className="text-ninja-muted ml-auto hidden lg:block truncate max-w-xs">{aiSignal.reasoning}</span>
            </div>
          )}

          {/* Positions table — directly below chart */}
          <PositionsTable />
        </div>

        {/* Right panel — tabbed */}
        <div className="xl:col-span-1">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}
