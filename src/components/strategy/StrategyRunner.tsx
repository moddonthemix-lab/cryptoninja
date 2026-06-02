"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useStrategyRunner } from "@/hooks/useStrategyRunner";
import { cn } from "@/lib/utils";
import { Play, Square, Activity, AlertTriangle, TrendingUp, TrendingDown, Clock, Zap } from "lucide-react";
import type { Strategy } from "@/types";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const LOG_COLORS: Record<string, string> = {
  info: "text-ninja-muted",
  signal: "text-ninja-accent font-semibold",
  trade: "text-ninja-green font-semibold",
  sl: "text-ninja-red",
  tp: "text-ninja-green",
  error: "text-red-400",
};

export function StrategyRunner() {
  const { strategies, openPositions, paperBalance, emergencyStop, tradingMode } = useStore();
  const [selectedStratId, setSelectedStratId] = useState<string>("");
  const [timeframe, setTimeframe] = useState("1h");

  const selectedStrat = strategies.find((s) => s.id === selectedStratId) ?? null;
  const { running, start, stop, lastScan, logs, scanCount } = useStrategyRunner(selectedStrat, timeframe);

  const stratStrategies = strategies.filter((s) => s.mode === "paper" || tradingMode === "paper");

  if (strategies.length === 0) {
    return (
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-5">
        <h2 className="font-bold text-ninja-text text-sm uppercase tracking-wider mb-3">
          TheStrat Paper Runner
        </h2>
        <p className="text-ninja-muted text-sm">
          No strategies yet.{" "}
          <a href="/strategy/new" className="text-ninja-accent hover:underline">
            Build one first →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className={cn("transition-colors", running ? "text-ninja-green animate-pulse" : "text-ninja-muted")} />
          <h2 className="font-bold text-ninja-text text-sm uppercase tracking-wider">TheStrat Paper Runner</h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-ninja-muted">
          <Clock size={11} />
          {scanCount} scans
        </div>
      </div>

      {emergencyStop && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle size={12} /> Emergency stop active — resume trading to use scanner
        </div>
      )}

      {/* Strategy + timeframe selectors */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-ninja-muted text-xs mb-1 block">Strategy</label>
          <select
            value={selectedStratId}
            onChange={(e) => setSelectedStratId(e.target.value)}
            disabled={running}
            className="input text-sm w-full"
          >
            <option value="">— choose a strategy —</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.asset} · {s.direction})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-ninja-muted text-xs mb-1 block">Scan Timeframe</label>
          <div className="flex gap-1 flex-wrap">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                disabled={running}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-3 py-1 rounded text-xs font-mono transition-all",
                  timeframe === tf
                    ? "bg-ninja-accent text-white"
                    : "bg-ninja-bg border border-ninja-border text-ninja-muted hover:text-ninja-text"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected strategy summary */}
      {selectedStrat && (
        <div className="bg-ninja-bg rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-ninja-muted">Asset</span>
            <span className="text-ninja-text font-bold">{selectedStrat.asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ninja-muted">Direction</span>
            <span className={cn("font-bold capitalize",
              selectedStrat.direction === "long" ? "text-ninja-green"
              : selectedStrat.direction === "short" ? "text-ninja-red"
              : "text-ninja-accent"
            )}>
              {selectedStrat.direction}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ninja-muted">Pattern</span>
            <span className="text-ninja-text font-mono">
              {(selectedStrat as any).stratPattern ?? "Any TheStrat pattern"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ninja-muted">SL / TP</span>
            <span className="text-ninja-text font-mono">{selectedStrat.stopLoss}% / {selectedStrat.takeProfit}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ninja-muted">Leverage</span>
            <span className="text-ninja-text font-mono">{selectedStrat.leverage}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ninja-muted">Paper Balance</span>
            <span className="text-ninja-green font-mono font-bold">${paperBalance.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Start / Stop */}
      <button
        onClick={running ? stop : start}
        disabled={!selectedStrat || emergencyStop}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all",
          running
            ? "bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30"
            : selectedStrat && !emergencyStop
            ? "bg-ninja-accent hover:bg-ninja-accent/80 text-white"
            : "bg-ninja-border/30 text-ninja-muted cursor-not-allowed"
        )}
      >
        {running ? <><Square size={14} /> Stop Scanner</> : <><Play size={14} /> Start Scanner</>}
      </button>

      {/* Last scan result */}
      {lastScan && (
        <div className={cn(
          "rounded-lg border p-3 text-xs space-y-1",
          lastScan.signal
            ? lastScan.direction === "long"
              ? "border-green-500/30 bg-green-500/5"
              : "border-red-500/30 bg-red-500/5"
            : "border-ninja-border bg-ninja-bg"
        )}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-ninja-text">Last Scan Result</span>
            {lastScan.signal ? (
              <span className={cn("flex items-center gap-1 font-bold",
                lastScan.direction === "long" ? "text-ninja-green" : "text-ninja-red"
              )}>
                {lastScan.direction === "long"
                  ? <TrendingUp size={11} />
                  : <TrendingDown size={11} />}
                SIGNAL
              </span>
            ) : (
              <span className="text-ninja-muted">No signal</span>
            )}
          </div>
          {lastScan.signal && (
            <>
              <div className="flex justify-between"><span className="text-ninja-muted">Pattern</span><span className="text-ninja-text">{lastScan.pattern}</span></div>
              <div className="flex justify-between"><span className="text-ninja-muted">Entry</span><span className="text-ninja-accent font-mono">${lastScan.suggestedEntry?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-ninja-muted">SL / TP</span>
                <span className="font-mono">
                  <span className="text-ninja-red">${lastScan.suggestedSL?.toFixed(2)}</span>
                  {" / "}
                  <span className="text-ninja-green">${lastScan.suggestedTP?.toFixed(2)}</span>
                </span>
              </div>
            </>
          )}
          {/* Recent candle types */}
          {lastScan.lastCandles && (
            <div className="flex gap-1 mt-1 pt-1 border-t border-ninja-border">
              {lastScan.lastCandles.map((c, i) => (
                <span key={i} className={cn(
                  "px-1.5 py-0.5 rounded text-xs font-bold font-mono",
                  c.stratType === "2U" ? "bg-green-500/20 text-green-400"
                  : c.stratType === "2D" ? "bg-red-500/20 text-red-400"
                  : c.stratType === 3 ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-ninja-border text-ninja-muted"
                )}>
                  {c.stratType}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Open positions */}
      {openPositions.filter((p) => p.isOpen).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-ninja-muted uppercase tracking-wide">Open Positions</p>
          {openPositions.filter((p) => p.isOpen).map((pos) => {
            const currentPrice = useStore.getState().marketData[pos.asset]?.price ?? pos.entryPrice;
            const priceDiff = pos.direction === "long"
              ? currentPrice - pos.entryPrice
              : pos.entryPrice - currentPrice;
            const pnl = priceDiff * pos.size * pos.leverage;
            const pnlPct = (priceDiff / pos.entryPrice) * 100 * pos.leverage;
            return (
              <div key={pos.id} className="flex items-center justify-between text-xs bg-ninja-bg rounded-lg px-3 py-2">
                <span className="flex items-center gap-1.5">
                  {pos.direction === "long"
                    ? <TrendingUp size={11} className="text-ninja-green" />
                    : <TrendingDown size={11} className="text-ninja-red" />}
                  <span className="font-bold">{pos.asset}</span>
                  <span className="text-ninja-muted">{pos.leverage}x</span>
                </span>
                <span className={cn("font-mono font-bold", pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Activity log */}
      {logs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-ninja-muted uppercase tracking-wide">Activity Log</p>
          <div className="max-h-36 overflow-y-auto space-y-0.5 font-mono">
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-ninja-muted flex-shrink-0">{entry.time}</span>
                <span className={LOG_COLORS[entry.type] ?? "text-ninja-text"}>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
