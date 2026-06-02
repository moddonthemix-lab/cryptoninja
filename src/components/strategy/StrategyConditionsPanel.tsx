"use client";

import { useState } from "react";
import { STRAT_PATTERNS, type StratPattern } from "@/lib/thestrat";
import { cn } from "@/lib/utils";

interface StrategyConditionsPanelProps {
  useStrat: boolean;
  onToggleStrat: (v: boolean) => void;
  selectedPattern: string | null;
  onSelectPattern: (name: string | null) => void;
  // Standard conditions
  conditions: Array<{
    indicator: string;
    operator: string;
    value: number;
    period: number;
  }>;
  onAddCondition: () => void;
  onRemoveCondition: (i: number) => void;
  onUpdateCondition: (i: number, field: string, value: any) => void;
}

const INDICATOR_OPTIONS = [
  { value: "RSI", label: "RSI" },
  { value: "EMA", label: "EMA" },
  { value: "SMA", label: "SMA" },
  { value: "MACD", label: "MACD" },
  { value: "BB", label: "Bollinger Bands" },
  { value: "VWAP", label: "VWAP" },
  { value: "VOLUME", label: "Volume" },
];

const OPERATOR_OPTIONS = [
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
];

const TYPE_FILTERS = ["all", "reversal", "continuation", "expansion"] as const;
const DIR_FILTERS = ["all", "bullish", "bearish"] as const;

export function StrategyConditionsPanel({
  useStrat,
  onToggleStrat,
  selectedPattern,
  onSelectPattern,
  conditions,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
}: StrategyConditionsPanelProps) {
  const [typeFilter, setTypeFilter] = useState<typeof TYPE_FILTERS[number]>("all");
  const [dirFilter, setDirFilter] = useState<typeof DIR_FILTERS[number]>("all");
  const [showActionable, setShowActionable] = useState(true);

  const filtered = STRAT_PATTERNS.filter((p) => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (dirFilter !== "all" && p.direction !== dirFilter) return false;
    if (!showActionable && p.actionable) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onToggleStrat(false)}
          className={cn(
            "flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all",
            !useStrat
              ? "border-ninja-accent bg-ninja-accent/20 text-ninja-accent"
              : "border-ninja-border text-ninja-muted hover:border-ninja-accent/40"
          )}
        >
          Custom Conditions
        </button>
        <button
          type="button"
          onClick={() => onToggleStrat(true)}
          className={cn(
            "flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all",
            useStrat
              ? "border-ninja-accent bg-ninja-accent/20 text-ninja-accent"
              : "border-ninja-border text-ninja-muted hover:border-ninja-accent/40"
          )}
        >
          #TheStrat Patterns
        </button>
      </div>

      {useStrat ? (
        <div className="space-y-3">
          <div className="bg-ninja-accent/5 border border-ninja-accent/20 rounded-xl p-3 text-xs text-ninja-muted leading-relaxed">
            <p className="font-bold text-ninja-accent mb-1">#TheStrat — Rob Smith&apos;s Methodology</p>
            <p>Candles are classified as <strong className="text-ninja-text">1</strong> (inside), <strong className="text-ninja-green">2U</strong> (directional up), <strong className="text-ninja-red">2D</strong> (directional down), or <strong className="text-yellow-400">3</strong> (outside). Select a 2 or 3-candle pattern to trade.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTypeFilter(f)}
                  className={cn(
                    "px-2 py-1 rounded text-xs capitalize transition-all border",
                    typeFilter === f
                      ? "bg-ninja-accent/20 border-ninja-accent/40 text-ninja-accent"
                      : "border-ninja-border text-ninja-muted hover:border-ninja-accent/30"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {DIR_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDirFilter(f)}
                  className={cn(
                    "px-2 py-1 rounded text-xs capitalize transition-all border",
                    dirFilter === f
                      ? f === "bullish"
                        ? "bg-green-500/20 border-green-500/40 text-green-400"
                        : f === "bearish"
                        ? "bg-red-500/20 border-red-500/40 text-red-400"
                        : "bg-ninja-accent/20 border-ninja-accent/40 text-ninja-accent"
                      : "border-ninja-border text-ninja-muted hover:border-ninja-accent/30"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowActionable(!showActionable)}
              className={cn(
                "px-2 py-1 rounded text-xs transition-all border",
                !showActionable
                  ? "bg-ninja-border/50 border-ninja-border text-ninja-muted"
                  : "border-ninja-border text-ninja-muted hover:border-ninja-accent/30"
              )}
            >
              {showActionable ? "Hide" : "Show"} Actionable
            </button>
          </div>

          {/* Pattern grid */}
          <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
            {filtered.map((pattern) => (
              <button
                key={pattern.name}
                type="button"
                onClick={() =>
                  onSelectPattern(selectedPattern === pattern.name ? null : pattern.name)
                }
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                  selectedPattern === pattern.name
                    ? pattern.direction === "bullish"
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-red-500/50 bg-red-500/10"
                    : "border-ninja-border hover:border-ninja-accent/40 bg-ninja-border/10"
                )}
              >
                {/* Candle sequence */}
                <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  {pattern.candles.map((c, i) => (
                    <span
                      key={i}
                      className={cn(
                        "text-xs font-bold px-1.5 py-0.5 rounded",
                        c === 1 ? "bg-ninja-border/50 text-ninja-muted" :
                        c === "2U" ? "bg-green-500/20 text-green-400" :
                        c === "2D" ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      )}
                    >
                      {String(c)}
                    </span>
                  ))}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-ninja-text truncate">{pattern.name}</span>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded flex-shrink-0",
                      pattern.actionable
                        ? "bg-ninja-accent/20 text-ninja-accent"
                        : "bg-ninja-border/50 text-ninja-muted"
                    )}>
                      {pattern.actionable ? "Actionable" : "In-Force"}
                    </span>
                  </div>
                  <p className="text-ninja-muted text-xs leading-tight">{pattern.description}</p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-ninja-muted text-sm py-4">No patterns match filters</p>
            )}
          </div>

          {selectedPattern && (
            <div className="bg-ninja-accent/10 border border-ninja-accent/30 rounded-xl p-3 text-xs">
              <span className="text-ninja-accent font-bold">Selected: </span>
              <span className="text-ninja-text">{selectedPattern}</span>
              <button
                type="button"
                onClick={() => onSelectPattern(null)}
                className="text-ninja-muted hover:text-ninja-red ml-2 transition-colors"
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Custom conditions */
        <div className="space-y-2">
          {conditions.length === 0 && (
            <div className="text-center py-4 text-ninja-muted text-sm">
              <p>No conditions — AI uses its own analysis</p>
            </div>
          )}
          {conditions.map((cond, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-ninja-border/20 rounded-xl flex-wrap">
              <select
                value={cond.indicator}
                onChange={(e) => onUpdateCondition(index, "indicator", e.target.value)}
                className="input flex-1 min-w-[100px]"
              >
                {INDICATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) => onUpdateCondition(index, "operator", e.target.value)}
                className="input w-32"
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={cond.value}
                onChange={(e) => onUpdateCondition(index, "value", parseFloat(e.target.value))}
                className="input w-20"
                placeholder="Value"
              />
              <input
                type="number"
                value={cond.period}
                onChange={(e) => onUpdateCondition(index, "period", parseInt(e.target.value))}
                className="input w-16"
                placeholder="Period"
              />
              <button
                type="button"
                onClick={() => onRemoveCondition(index)}
                className="text-ninja-muted hover:text-ninja-red transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddCondition}
            className="w-full py-2 border border-dashed border-ninja-border rounded-xl text-ninja-muted hover:border-ninja-accent/50 hover:text-ninja-accent transition-all text-xs"
          >
            + Add Condition
          </button>
        </div>
      )}
    </div>
  );
}
