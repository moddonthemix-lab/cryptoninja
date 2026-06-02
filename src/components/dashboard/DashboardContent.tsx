"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { TradingChart } from "@/components/chart/TradingChart";
import { StatsGrid } from "./StatsGrid";
import { PositionsTable } from "./PositionsTable";
import { AIBrain } from "./AIBrain";
import { MarketTicker } from "./MarketTicker";
import type { Candle } from "@/types";

export function DashboardContent() {
  const { selectedAsset, marketData, openPositions, aiSignals } = useStore();
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    fetch(`/api/market/${selectedAsset}?interval=1h&limit=100`)
      .then((r) => r.json())
      .then((d) => setCandles(d.candles || []));
    const id = setInterval(() => {
      fetch(`/api/market/${selectedAsset}?interval=1h&limit=100`)
        .then((r) => r.json())
        .then((d) => setCandles(d.candles || []));
    }, 30000);
    return () => clearInterval(id);
  }, [selectedAsset]);

  const price = marketData[selectedAsset]?.price;
  const aiSignal = aiSignals[selectedAsset];

  // Find active position for chart overlays
  const activePos = openPositions.find((p) => p.asset === selectedAsset && p.isOpen);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ninja-text">Dashboard</h1>
        <MarketTicker />
      </div>

      <StatsGrid />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chart - takes 2/3 */}
        <div className="xl:col-span-2">
          <TradingChart
            asset={selectedAsset}
            candles={candles}
            currentPrice={price}
            entryPrice={activePos?.entryPrice ?? aiSignal?.suggestedEntry}
            stopLoss={activePos?.stopLoss ?? aiSignal?.suggestedSL}
            takeProfit={activePos?.takeProfit ?? aiSignal?.suggestedTP}
            height={380}
          />
        </div>

        {/* AI Brain - takes 1/3 */}
        <div>
          <AIBrain />
        </div>
      </div>

      <PositionsTable />
    </div>
  );
}
