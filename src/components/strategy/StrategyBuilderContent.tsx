"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";
import type { Asset, StrategyCondition } from "@/types";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Brain, AlertTriangle, CheckCircle2 } from "lucide-react";

interface StrategyForm {
  name: string;
  description: string;
  asset: Asset;
  direction: "long" | "short" | "both";
  leverage: number;
  positionSizeType: "fixed" | "percent";
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop: boolean;
  trailingStopPct: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  cooldownMinutes: number;
  aiEnabled: boolean;
  mode: "paper" | "live";
}

const INDICATOR_OPTIONS = [
  { value: "RSI", label: "RSI (Relative Strength Index)" },
  { value: "EMA", label: "EMA (Exponential Moving Average)" },
  { value: "SMA", label: "SMA (Simple Moving Average)" },
  { value: "MACD", label: "MACD" },
  { value: "BB", label: "Bollinger Bands" },
  { value: "VWAP", label: "VWAP" },
  { value: "VOLUME", label: "Volume" },
];

const OPERATOR_OPTIONS = [
  { value: "gt", label: "Greater than (>)" },
  { value: "lt", label: "Less than (<)" },
  { value: "gte", label: "Greater than or equal (≥)" },
  { value: "lte", label: "Less than or equal (≤)" },
  { value: "crosses_above", label: "Crosses above" },
  { value: "crosses_below", label: "Crosses below" },
];

export function StrategyBuilderContent() {
  const router = useRouter();
  const { strategies, setStrategies, tradingMode } = useStore();
  const [conditions, setConditions] = useState<Partial<StrategyCondition>[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<StrategyForm>({
    defaultValues: {
      asset: "BTC",
      direction: "long",
      leverage: 3,
      positionSizeType: "percent",
      positionSize: 1,
      stopLoss: 1.5,
      takeProfit: 3,
      trailingStop: false,
      trailingStopPct: 1,
      maxDailyLoss: 5,
      maxTradesPerDay: 5,
      cooldownMinutes: 30,
      aiEnabled: true,
      mode: tradingMode === "live" ? "live" : "paper",
    },
  });

  const watchedLeverage = watch("leverage");
  const watchedSL = watch("stopLoss");
  const watchedTP = watch("takeProfit");
  const watchedMode = watch("mode");

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        id: `cond_${Date.now()}`,
        type: "indicator",
        indicator: "RSI",
        operator: "gt",
        value: 50,
        period: 14,
        order: conditions.length,
      },
    ]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<StrategyCondition>) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const onSubmit = async (data: StrategyForm) => {
    setSaving(true);
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, conditions }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const newStrategy = await res.json();
      setStrategies([...strategies, newStrategy]);
      setSaved(true);
      setTimeout(() => router.push("/strategy"), 1500);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const liquidationRisk = watchedLeverage * watchedSL;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ninja-text">Strategy Builder</h1>
        <p className="text-ninja-muted text-sm mt-0.5">
          Define your trading method — AI will execute it when conditions are met
        </p>
      </div>

      {/* Mode warning */}
      {watchedMode === "live" && (
        <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-bold text-sm">Live Trading Mode</p>
            <p className="text-red-300/70 text-xs mt-1">
              This strategy will execute real trades. Start with Paper mode first to validate your strategy.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Section title="Basic Info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Strategy Name</label>
              <input
                {...register("name", { required: true })}
                className="input"
                placeholder="e.g. BTC Breakout Long"
              />
            </div>
            <div>
              <label className="label">Mode</label>
              <select {...register("mode")} className="input">
                <option value="paper">📄 Paper Trading (Safe)</option>
                <option value="live">💰 Live Trading (Real Money)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea
              {...register("description")}
              className="input"
              rows={2}
              placeholder="e.g. When BTC breaks above resistance with RSI > 50..."
            />
          </div>
        </Section>

        {/* Asset & Direction */}
        <Section title="Asset & Direction">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(ASSETS) as Asset[]).map((asset) => (
              <label
                key={asset}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all",
                  watch("asset") === asset
                    ? "border-ninja-accent bg-ninja-accent/10"
                    : "border-ninja-border hover:border-ninja-accent/50"
                )}
              >
                <input {...register("asset")} type="radio" value={asset} className="sr-only" />
                <span className="text-lg font-bold" style={{ color: ASSETS[asset].color }}>
                  {ASSETS[asset].icon}
                </span>
                <span className="text-xs font-bold mt-1" style={{ color: ASSETS[asset].color }}>
                  {asset}
                </span>
                <span className="text-ninja-muted text-xs">{ASSETS[asset].name}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            {(["long", "short", "both"] as const).map((dir) => (
              <label
                key={dir}
                className={cn(
                  "flex-1 flex items-center justify-center py-2.5 rounded-xl border cursor-pointer text-sm font-bold capitalize transition-all",
                  watch("direction") === dir
                    ? dir === "long"
                      ? "border-green-500 bg-green-500/20 text-green-400"
                      : dir === "short"
                      ? "border-red-500 bg-red-500/20 text-red-400"
                      : "border-ninja-accent bg-ninja-accent/20 text-ninja-accent"
                    : "border-ninja-border text-ninja-muted hover:border-ninja-accent/40"
                )}
              >
                <input {...register("direction")} type="radio" value={dir} className="sr-only" />
                {dir === "long" ? "📈 Long" : dir === "short" ? "📉 Short" : "↕️ Both"}
              </label>
            ))}
          </div>
        </Section>

        {/* Risk & Sizing */}
        <Section title="Risk Management">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Leverage ({watchedLeverage}x)</label>
              <input
                {...register("leverage", { min: 1, max: 20, valueAsNumber: true })}
                type="range" min={1} max={20} step={0.5}
                className="w-full accent-ninja-accent"
              />
              <div className="flex justify-between text-xs text-ninja-muted mt-1">
                <span>1x</span>
                <span className={cn(watchedLeverage > 10 ? "text-red-400" : watchedLeverage > 5 ? "text-yellow-400" : "text-green-400")}>
                  {watchedLeverage}x {watchedLeverage > 10 ? "⚠️ Very High Risk" : watchedLeverage > 5 ? "Medium Risk" : "Lower Risk"}
                </span>
                <span>20x</span>
              </div>
            </div>

            <div>
              <label className="label">Stop Loss %</label>
              <input
                {...register("stopLoss", { required: true, min: 0.1, max: 50, valueAsNumber: true })}
                type="number" step="0.1" className="input"
              />
            </div>

            <div>
              <label className="label">Take Profit %</label>
              <input
                {...register("takeProfit", { required: true, min: 0.1, max: 100, valueAsNumber: true })}
                type="number" step="0.1" className="input"
              />
            </div>

            <div>
              <label className="label">Position Size</label>
              <div className="flex gap-2">
                <select {...register("positionSizeType")} className="input w-24 flex-shrink-0">
                  <option value="percent">%</option>
                  <option value="fixed">USD</option>
                </select>
                <input
                  {...register("positionSize", { required: true, min: 0.01, valueAsNumber: true })}
                  type="number" step="0.01" className="input flex-1"
                />
              </div>
            </div>

            <div>
              <label className="label">Max Daily Loss %</label>
              <input
                {...register("maxDailyLoss", { required: true, min: 0.1, max: 100, valueAsNumber: true })}
                type="number" step="0.1" className="input"
              />
            </div>

            <div>
              <label className="label">Max Trades / Day</label>
              <input
                {...register("maxTradesPerDay", { required: true, min: 1, max: 100, valueAsNumber: true })}
                type="number" className="input"
              />
            </div>
          </div>

          {/* Risk preview */}
          <div className="bg-ninja-border/20 rounded-xl p-4 mt-2">
            <p className="text-xs text-ninja-muted mb-2 font-bold">RISK PREVIEW</p>
            <div className="flex gap-6 text-xs">
              <div>
                <span className="text-ninja-muted">R:R Ratio</span>
                <span className={cn("ml-2 font-mono font-bold", watchedTP / watchedSL >= 2 ? "text-ninja-green" : "text-ninja-yellow")}>
                  1:{(watchedTP / watchedSL).toFixed(1)}
                </span>
              </div>
              <div>
                <span className="text-ninja-muted">Liquidation at</span>
                <span className="ml-2 font-mono font-bold text-ninja-red">
                  -{(100 / watchedLeverage).toFixed(1)}% move
                </span>
              </div>
              <div>
                <span className="text-ninja-muted">SL triggers at</span>
                <span className="ml-2 font-mono font-bold text-ninja-red">-{watchedSL}% ({watchedLeverage * watchedSL}% of margin)</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Entry Conditions */}
        <Section
          title="Entry Conditions"
          action={
            <button
              type="button"
              onClick={addCondition}
              className="flex items-center gap-1 text-ninja-accent hover:text-ninja-accent-hover text-xs transition-colors"
            >
              <Plus size={14} /> Add Condition
            </button>
          }
        >
          {conditions.length === 0 && (
            <div className="text-center py-6 text-ninja-muted text-sm">
              <p>No conditions set — AI will use its own analysis</p>
              <p className="text-xs mt-1 opacity-70">Add conditions like &quot;RSI &gt; 50&quot; or &quot;Price crosses above EMA 200&quot;</p>
            </div>
          )}

          {conditions.map((cond, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-ninja-border/20 rounded-xl">
              <select
                value={cond.indicator || "RSI"}
                onChange={(e) => updateCondition(index, { indicator: e.target.value as any })}
                className="input flex-1 min-w-0"
              >
                {INDICATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={cond.operator || "gt"}
                onChange={(e) => updateCondition(index, { operator: e.target.value as any })}
                className="input w-40"
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={cond.value ?? ""}
                onChange={(e) => updateCondition(index, { value: parseFloat(e.target.value) })}
                className="input w-24"
                placeholder="Value"
              />
              <input
                type="number"
                value={cond.period ?? ""}
                onChange={(e) => updateCondition(index, { period: parseInt(e.target.value) })}
                className="input w-20"
                placeholder="Period"
              />
              <button
                type="button"
                onClick={() => removeCondition(index)}
                className="text-ninja-muted hover:text-ninja-red transition-colors flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Section>

        {/* AI Settings */}
        <Section title="AI Brain">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                {...register("aiEnabled")}
                type="checkbox"
                className="sr-only"
              />
              <div className={cn(
                "w-10 h-5 rounded-full transition-all",
                watch("aiEnabled") ? "bg-ninja-accent" : "bg-ninja-border"
              )}>
                <div className={cn(
                  "w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform",
                  watch("aiEnabled") ? "translate-x-5" : "translate-x-0.5"
                )} />
              </div>
            </div>
            <div>
              <p className="text-sm text-ninja-text font-semibold flex items-center gap-2">
                <Brain size={14} className="text-ninja-accent" />
                Enable AI Brain (Claude)
              </p>
              <p className="text-xs text-ninja-muted">AI analyzes conditions and can override or enhance signals</p>
            </div>
          </label>
        </Section>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || saved}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
              saved
                ? "bg-green-600/30 text-green-400 border border-green-500/40"
                : "bg-ninja-accent hover:bg-ninja-accent-hover text-white"
            )}
          >
            {saved ? (
              <><CheckCircle2 size={16} /> Strategy Saved!</>
            ) : saving ? (
              "Saving..."
            ) : (
              "Save Strategy"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-ninja-text text-sm uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
