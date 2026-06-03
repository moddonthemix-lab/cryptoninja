"use client";

import { useStore } from "@/store/useStore";
import { useAutoTrader } from "@/hooks/useAutoTrader";
import { cn } from "@/lib/utils";
import { Zap, TrendingUp, TrendingDown, AlertTriangle, Activity, Lock } from "lucide-react";

const STATE_LABEL: Record<string, string> = {
  idle: "Waiting for signal",
  scanning: "Scanning markets...",
  in_position: "In position",
  error: "Error — check logs",
};

const STATE_COLOR: Record<string, string> = {
  idle: "text-ninja-muted",
  scanning: "text-ninja-accent animate-pulse",
  in_position: "text-ninja-green",
  error: "text-red-400",
};

const LOG_COLOR: Record<string, string> = {
  info: "text-ninja-muted",
  trade: "text-ninja-accent font-medium",
  sl: "text-ninja-red font-medium",
  tp: "text-ninja-green font-medium",
  trail: "text-yellow-400 font-medium",
  error: "text-red-400",
};

export function AutoTrader() {
  const {
    autoTradeEnabled, toggleAutoTrade,
    autoTradeLeverage, setAutoTradeLeverage,
    selectedAsset, tradingMode, emergencyStop,
    openPositions, paperBalance,
  } = useStore();

  const status = useAutoTrader(selectedAsset);
  const activePos = openPositions.find((p) => p.isOpen && p.asset === selectedAsset);
  const isLive = tradingMode === "live";

  return (
    <div className={cn(
      "bg-ninja-card border rounded-xl p-4 space-y-4",
      autoTradeEnabled ? "border-ninja-accent/40" : "border-ninja-border"
    )}>
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={15} className={cn(autoTradeEnabled ? "text-ninja-accent" : "text-ninja-muted")} />
          <span className="font-bold text-sm text-ninja-text">Auto Trader</span>
          {isLive ? (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">LIVE</span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded bg-ninja-border text-ninja-muted">PAPER</span>
          )}
        </div>
        <button
          onClick={toggleAutoTrade}
          disabled={emergencyStop}
          title={emergencyStop ? "Emergency stop active" : ""}
          className={cn(
            "relative w-11 h-6 rounded-full transition-colors duration-200",
            autoTradeEnabled ? "bg-ninja-accent" : "bg-ninja-border",
            emergencyStop && "opacity-40 cursor-not-allowed"
          )}
        >
          <span className={cn(
            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200",
            autoTradeEnabled ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>
      </div>

      {emergencyStop && (
        <div className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertTriangle size={11} /> Emergency stop active
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-2">
        <Activity size={12} className={STATE_COLOR[status.state]} />
        <span className={cn("text-xs", STATE_COLOR[status.state])}>
          {STATE_LABEL[status.state]}
        </span>
        {status.lastScanTime && (
          <span className="text-ninja-muted text-xs ml-auto">last: {status.lastScanTime}</span>
        )}
      </div>

      {/* Leverage control */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-ninja-muted">Leverage</span>
          <span className={cn(
            "font-mono font-bold",
            autoTradeLeverage > 10 ? "text-red-400"
            : autoTradeLeverage > 5 ? "text-yellow-400"
            : "text-ninja-green"
          )}>
            {autoTradeLeverage}x
          </span>
        </div>
        <input
          type="range" min={1} max={20} step={1}
          value={autoTradeLeverage}
          onChange={(e) => setAutoTradeLeverage(Number(e.target.value))}
          disabled={autoTradeEnabled}
          className="w-full accent-ninja-accent"
        />
        <div className="flex justify-between text-xs text-ninja-muted mt-0.5">
          <span>1x</span>
          <span className="text-ninja-muted/60 text-center">SL fixed 30% · TP 25–100% (AI)</span>
          <span>20x</span>
        </div>
      </div>

      {/* Active position */}
      {activePos && status.state === "in_position" && (
        <div className={cn(
          "rounded-lg border p-3 text-xs space-y-1.5",
          (status.currentPnlPct ?? 0) >= 0
            ? "border-green-500/30 bg-green-500/5"
            : "border-red-500/30 bg-red-500/5"
        )}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold">
              {activePos.direction === "long"
                ? <TrendingUp size={12} className="text-ninja-green" />
                : <TrendingDown size={12} className="text-ninja-red" />}
              {activePos.direction.toUpperCase()} {activePos.asset}
            </span>
            <span className={cn(
              "font-mono font-bold",
              (status.currentPnlPct ?? 0) >= 0 ? "text-ninja-green" : "text-ninja-red"
            )}>
              {(status.currentPnlPct ?? 0) >= 0 ? "+" : ""}{(status.currentPnlPct ?? 0).toFixed(1)}%
            </span>
          </div>

          <div className="flex justify-between text-ninja-muted">
            <span>Entry</span>
            <span className="font-mono text-ninja-text">${activePos.entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-ninja-muted">
            <span>SL / TP</span>
            <span className="font-mono">
              <span className="text-ninja-red">${activePos.stopLoss.toFixed(2)}</span>
              {" · "}
              <span className="text-ninja-green">${activePos.takeProfit.toFixed(2)}</span>
            </span>
          </div>

          {/* Trailing stop indicator */}
          {status.peakPnlPct !== null && status.peakPnlPct > 0 && (
            <div className={cn(
              "flex items-center gap-1.5 pt-1 border-t border-ninja-border",
              status.trailActive ? "text-yellow-400" : "text-ninja-muted"
            )}>
              <Lock size={10} />
              {status.trailActive ? (
                <span>Trail stop active — peak +{status.peakPnlPct.toFixed(1)}%</span>
              ) : (
                <span>Trail activates at peak (currently +{status.peakPnlPct.toFixed(1)}%)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Balance (paper) or live note */}
      {!isLive && (
        <div className="flex justify-between text-xs">
          <span className="text-ninja-muted">Paper Balance</span>
          <span className="font-mono font-bold text-ninja-green">${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {isLive && !autoTradeEnabled && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs text-yellow-300 leading-relaxed">
          <strong>Live mode:</strong> Bot will sign real orders via your wallet.
          Each trade uses 5% of your Hyperliquid equity.
          SL at −30% margin, TP dynamic (25–100%).
        </div>
      )}

      {/* How it works blurb (only when off, paper mode) */}
      {!autoTradeEnabled && !isLive && (
        <p className="text-ninja-muted/70 text-xs leading-relaxed">
          AI scans {selectedAsset} every 5 min using TheStrat FTFC.
          Hard SL at −30% margin. TP is dynamic (25–100%) based on momentum.
          Trailing stop locks profit once you're ahead.
        </p>
      )}

      {/* Log */}
      {status.log.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-ninja-muted uppercase tracking-wide">Log</p>
          <div className="max-h-32 overflow-y-auto space-y-0.5 font-mono">
            {status.log.map((e, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-ninja-muted/60 flex-shrink-0">{e.time}</span>
                <span className={LOG_COLOR[e.type] ?? "text-ninja-text"}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
