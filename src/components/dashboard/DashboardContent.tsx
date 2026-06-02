"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { TradingViewWidget } from "@/components/chart/TradingViewWidget";
import { StatsGrid } from "./StatsGrid";
import { PositionsTable } from "./PositionsTable";
import { AIBrain } from "./AIBrain";
import { MarketTicker } from "./MarketTicker";
import { TradingPanel } from "@/components/trading/TradingPanel";
import { HLPositions } from "@/components/trading/HLPositions";
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
  const { selectedAsset, setSelectedAsset, marketData, openPositions, aiSignals, tradingMode } = useStore();
  const [timeframe, setTimeframe] = useState("1h");

  const aiSignal = aiSignals[selectedAsset];
  const activePos = openPositions.find((p) => p.asset === selectedAsset && p.isOpen);

  return (
    <div className="space-y-4">
      <MarketTicker />

      {/* Asset tabs */}
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

      <StatsGrid />

      {/* Main trading area: chart + AI on top, trading panel on right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Chart column */}
        <div className="xl:col-span-3 space-y-2">
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

          {/* TradingView chart — real live data */}
          <TradingViewWidget
            asset={selectedAsset}
            timeframe={timeframe}
            height={460}
            entryPrice={activePos?.entryPrice ?? aiSignal?.suggestedEntry}
            stopLoss={activePos?.stopLoss ?? aiSignal?.suggestedSL}
            takeProfit={activePos?.takeProfit ?? aiSignal?.suggestedTP}
          />

          {/* AI signal bar */}
          {aiSignal && (
            <div className={cn(
              "rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap text-xs",
              aiSignal.direction === "long"
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <span className={cn(
                "font-bold px-2 py-0.5 rounded text-sm",
                aiSignal.direction === "long"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                AI: {aiSignal.direction.toUpperCase()}
              </span>
              <span className="text-ninja-muted">{aiSignal.confidence}% confidence</span>
              {aiSignal.suggestedEntry && (
                <span><span className="text-ninja-accent">Entry</span> ${aiSignal.suggestedEntry.toFixed(2)}</span>
              )}
              {aiSignal.suggestedSL && (
                <span><span className="text-ninja-red">SL</span> ${aiSignal.suggestedSL.toFixed(2)}</span>
              )}
              {aiSignal.suggestedTP && (
                <span><span className="text-ninja-green">TP</span> ${aiSignal.suggestedTP.toFixed(2)}</span>
              )}
              <span className="text-ninja-muted ml-auto hidden lg:block">{aiSignal.reasoning}</span>
            </div>
          )}
        </div>

        {/* Right sidebar: AI Brain + Trading Panel */}
        <div className="xl:col-span-1 space-y-4">
          <AIBrain />
          <TradingPanel />
        </div>
      </div>

      {/* Positions: paper table always, HL live positions when in live mode */}
      {tradingMode === "live" && <HLPositions />}
      <PositionsTable />
    </div>
  );
}
