"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { RefreshCw, TrendingUp, TrendingDown, Wallet, BarChart3, Percent, Trophy, ChevronLeft, ChevronRight } from "lucide-react";

interface DayAgg { date: string; pnl: number; wins: number; losses: number; volume: number; fees: number; trades: number; }
interface PortfolioData {
  realizedPnl: number; winRate: number; wins: number; losses: number;
  totalVolume: number; fees: number; trades: number; fillCount: number; daily: DayAgg[];
}

type Range = "7D" | "30D" | "1Y" | "ALL";
const RANGE_DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "1Y": 365, "ALL": 100000 };

function money(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(2)}K` : `$${abs.toFixed(2)}`;
  return n < 0 ? `-${s}` : s;
}

export function PortfolioContent() {
  const { tradingMode } = useStore();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30D");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hl/portfolio");
      const d = await res.json();
      if (!d.error) setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Filter daily data to the selected range and aggregate
  const view = useMemo(() => {
    if (!data) return null;
    const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
    const days = data.daily.filter((d) => new Date(d.date).getTime() >= cutoff);
    const pnl = days.reduce((s, d) => s + d.pnl, 0);
    const wins = days.reduce((s, d) => s + d.wins, 0);
    const losses = days.reduce((s, d) => s + d.losses, 0);
    const volume = days.reduce((s, d) => s + d.volume, 0);
    const fees = days.reduce((s, d) => s + d.fees, 0);
    const trades = days.reduce((s, d) => s + d.trades, 0);
    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    // cumulative series
    let cum = 0;
    const series = days.map((d) => ({ date: d.date, value: (cum += d.pnl) }));
    return { days, pnl, wins, losses, volume, fees, trades, winRate, series };
  }, [data, range]);

  const dayMap = useMemo(() => {
    const m: Record<string, DayAgg> = {};
    (data?.daily ?? []).forEach((d) => { m[d.date] = d; });
    return m;
  }, [data]);

  if (tradingMode !== "live") {
    return (
      <div className="p-6">
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-8 text-center">
          <Wallet className="mx-auto mb-3 text-ninja-muted" size={28} />
          <p className="text-ninja-text font-bold mb-1">Live Portfolio</p>
          <p className="text-ninja-muted text-sm">Switch to <span className="text-green-400 font-bold">LIVE</span> mode to see your real Hyperliquid stats.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ninja-text">Portfolio <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 align-middle">LIVE</span></h1>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ninja-card border border-ninja-border text-ninja-muted hover:text-ninja-text text-sm transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      {view && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Realized PnL" icon={view.pnl >= 0 ? <TrendingUp size={16} className="text-ninja-green" /> : <TrendingDown size={16} className="text-ninja-red" />}
            value={money(view.pnl)} valueClass={view.pnl >= 0 ? "text-ninja-green" : "text-ninja-red"} />
          <Stat label="Win Rate" icon={<Percent size={16} className="text-ninja-accent" />}
            value={`${view.winRate.toFixed(1)}%`} valueClass="text-ninja-text" />
          <Stat label="Wins / Losses" icon={<Trophy size={16} className="text-yellow-400" />}
            value={<span><span className="text-ninja-green">{view.wins}W</span> <span className="text-ninja-muted">/</span> <span className="text-ninja-red">{view.losses}L</span></span>} valueClass="" />
          <Stat label="Total Volume" icon={<BarChart3 size={16} className="text-ninja-accent" />}
            value={money(view.volume)} valueClass="text-ninja-text" />
          <Stat label="Fees Paid" icon={<Wallet size={16} className="text-ninja-muted" />}
            value={money(view.fees)} valueClass="text-ninja-red" />
          <Stat label="Closed Trades" icon={<BarChart3 size={16} className="text-ninja-accent" />}
            value={`${view.trades}`} valueClass="text-ninja-text" />
        </div>
      )}

      {/* Range selector */}
      <div className="flex justify-end">
        <div className="flex items-center gap-1 bg-ninja-card border border-ninja-border rounded-lg p-1">
          {(["7D", "30D", "1Y", "ALL"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", range === r ? "bg-ninja-accent text-white" : "text-ninja-muted hover:text-ninja-text")}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Cumulative PnL chart */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-sm text-ninja-text">Realized PnL</span>
          {view && <span className={cn("font-mono font-bold", view.pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>{money(view.pnl)}</span>}
        </div>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-ninja-muted text-sm">Loading…</div>
        ) : view && view.series.length > 1 ? (
          <PnlLineChart series={view.series} />
        ) : (
          <div className="h-64 flex items-center justify-center text-ninja-muted text-sm">No closed trades in this range</div>
        )}
      </div>

      {/* PnL calendar */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-sm text-ninja-text">PnL Calendar</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCalMonth((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m }; })}
              className="p-1 rounded text-ninja-muted hover:text-ninja-text"><ChevronLeft size={16} /></button>
            <span className="text-sm text-ninja-text w-28 text-center">
              {new Date(calMonth.y, calMonth.m).toLocaleString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => setCalMonth((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m }; })}
              className="p-1 rounded text-ninja-muted hover:text-ninja-text"><ChevronRight size={16} /></button>
          </div>
        </div>
        <Calendar y={calMonth.y} m={calMonth.m} dayMap={dayMap} />
      </div>
    </div>
  );
}

function Stat({ label, value, icon, valueClass }: { label: string; value: React.ReactNode; icon: React.ReactNode; valueClass: string }) {
  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 ninja-card-hover">
      <div className="flex items-start justify-between">
        <span className="text-xs text-ninja-muted uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={cn("font-mono font-bold text-xl mt-2", valueClass)}>{value}</div>
    </div>
  );
}

// Lightweight SVG line chart
function PnlLineChart({ series }: { series: { date: string; value: number }[] }) {
  const W = 800, H = 256, pad = { l: 8, r: 8, t: 12, b: 20 };
  const values = series.map((s) => s.value);
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const range = max - min || 1;
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / range) * (H - pad.t - pad.b);
  const path = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const color = last >= 0 ? "#10b981" : "#ef4444";
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 256 }} preserveAspectRatio="none">
      {/* zero line */}
      <line x1={pad.l} y1={zeroY} x2={W - pad.r} y2={zeroY} stroke="#1e1e2e" strokeWidth={1} strokeDasharray="4 4" />
      {/* area */}
      <path d={`${path} L${x(series.length - 1)},${zeroY} L${x(0)},${zeroY} Z`} fill={color} opacity={0.08} />
      {/* line */}
      <path d={path} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Calendar({ y, m, dayMap }: { y: number; m: number; dayMap: Record<string, DayAgg> }) {
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} className="text-center text-[10px] text-ninja-muted font-bold">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${y}-${pad(m + 1)}-${pad(d)}`;
          const agg = dayMap[key];
          const hasData = agg && (agg.wins + agg.losses) > 0;
          const positive = (agg?.pnl ?? 0) >= 0;
          return (
            <div key={i} className={cn(
              "rounded-lg border min-h-[64px] p-1.5 flex flex-col",
              hasData
                ? positive ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"
                : "border-ninja-border/50 bg-ninja-bg/30"
            )}>
              <span className={cn("text-xs font-bold", hasData ? "text-ninja-text" : "text-ninja-muted/60")}>{d}</span>
              {hasData && (
                <div className="mt-auto">
                  <div className={cn("text-xs font-mono font-bold", positive ? "text-ninja-green" : "text-ninja-red")}>
                    {agg.pnl >= 0 ? "+" : "-"}${Math.abs(agg.pnl).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-ninja-muted">{agg.wins}W/{agg.losses}L</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
