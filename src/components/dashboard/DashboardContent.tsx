"use client";

import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { LightweightChart } from "@/components/chart/LightweightChart";
import { StatsGrid } from "./StatsGrid";
import { PositionsTable } from "./PositionsTable";
import { MarketTicker } from "./MarketTicker";
import { RightPanel } from "./RightPanel";
import { AssetPicker } from "./AssetPicker";
import { ASSETS, DEFAULT_WATCHLIST } from "@/types";
import { cn } from "@/lib/utils";

export function DashboardContent() {
  const { selectedAsset, setSelectedAsset, openPositions, aiSignals, chartOverlay } = useStore();
  const { livePositions } = useHyperliquid();

  const aiSignal = aiSignals[selectedAsset];
  const activePos = openPositions.find((p) => p.asset === selectedAsset && p.isOpen);

  // Live HL position for the selected asset (entry line in live mode)
  const livePos = livePositions.find((p) => p.coin === ASSETS[selectedAsset]?.hlCoin || p.coin === selectedAsset);

  // What to draw on the chart, in priority order:
  // 1) the trade ticket overlay (matches selected asset)
  // 2) live position entry  3) paper position  4) AI signal
  const overlayMatches = chartOverlay && chartOverlay.asset === selectedAsset;
  const chartEntry = overlayMatches ? chartOverlay!.entry ?? undefined
    : livePos ? parseFloat(livePos.entryPx)
    : activePos?.entryPrice ?? aiSignal?.suggestedEntry;
  const chartSl = overlayMatches ? chartOverlay!.sl ?? undefined
    : activePos?.stopLoss ?? aiSignal?.suggestedSL;
  const chartTp = overlayMatches ? chartOverlay!.tp ?? undefined
    : activePos?.takeProfit ?? aiSignal?.suggestedTP;

  // Quick-access watchlist: defaults + the current selection if it's not in defaults
  const quickList = DEFAULT_WATCHLIST.includes(selectedAsset)
    ? DEFAULT_WATCHLIST
    : [selectedAsset, ...DEFAULT_WATCHLIST];


  return (
    <div className="space-y-3 animate-fade-in">
      <MarketTicker />

      {/* Picker + quick watchlist + current price + inline stats */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <AssetPicker />

          {/* Quick watchlist chips */}
          <div className="hidden lg:flex items-center gap-1">
            {quickList.map((asset) => {
              const isSel = selectedAsset === asset;
              return (
                <button
                  key={asset}
                  onClick={() => setSelectedAsset(asset)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold transition-all",
                    isSel
                      ? "bg-ninja-accent/15 text-ninja-accent"
                      : "text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/30"
                  )}
                  style={isSel ? undefined : { color: ASSETS[asset]?.color }}
                >
                  {asset}
                </button>
              );
            })}
          </div>
        </div>

        <StatsGrid />
      </div>

      {/* Main grid: chart 3 cols, right panel 1 col */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3" style={{ minHeight: 0 }}>

        {/* Chart column */}
        <div className="xl:col-span-3 flex flex-col gap-2">
          {/* Native chart (lightweight-charts) — supports live entry/SL/TP lines */}
          <LightweightChart
            asset={selectedAsset}
            height={520}
            entryPrice={chartEntry}
            stopLoss={chartSl}
            takeProfit={chartTp}
          />

          {/* AI signal bar — compact one-liner */}
          {aiSignal && (
            <div className={cn(
              "rounded-lg border px-3 py-2 flex items-center gap-3 flex-wrap text-xs animate-slide-up",
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
