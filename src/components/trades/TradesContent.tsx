"use client";

import { useEffect, useState } from "react";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";
import { Filter, RefreshCw } from "lucide-react";

interface Row {
  id: string; asset: string; direction: "long" | "short";
  entryPrice?: number; exitPrice?: number; leverage?: number; size: number;
  pnl: number; pnlPercent?: number; closeReason?: string; mode: "live" | "paper"; time: number;
}

const fmtTime = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / 1000);
  if (d < 60) return `${d}s`;
  const m = Math.floor(d / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function TradesContent() {
  const [live, setLive] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "long" | "short" | "win" | "loss">("all");

  const loadLive = () => {
    setLoading(true);
    fetch("/api/hl/fills").then((r) => r.json())
      .then((d) => { if (Array.isArray(d.rows)) setLive(d.rows); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadLive(); const id = setInterval(loadLive, 30000); return () => clearInterval(id); }, []);

  const all = [...live].sort((a, b) => b.time - a.time);
  const filtered = all.filter((t) => {
    if (filter === "long") return t.direction === "long";
    if (filter === "short") return t.direction === "short";
    if (filter === "win") return t.pnl > 0;
    if (filter === "loss") return t.pnl < 0;
    return true;
  });

  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);
  const wins = filtered.filter((t) => t.pnl > 0).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ninja-text">Trade History</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full font-bold bg-green-500/20 text-green-400">LIVE</span>
          <button onClick={loadLive} title="Refresh" className="p-1.5 rounded-md text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/40">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className={cn("text-lg font-bold font-mono", totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
            {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(2)}
          </div>
          <div className="text-ninja-muted text-xs">Total PnL</div>
        </div>
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className={cn("text-lg font-bold", winRate >= 50 ? "text-ninja-green" : "text-ninja-red")}>{winRate.toFixed(1)}%</div>
          <div className="text-ninja-muted text-xs">Win Rate</div>
        </div>
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-ninja-text">{filtered.length}</div>
          <div className="text-ninja-muted text-xs">Closed Trades</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-ninja-muted" />
        {(["all", "long", "short", "win", "loss"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all border",
              filter === f ? "bg-ninja-accent/20 text-ninja-accent border-ninja-accent/40" : "border-ninja-border text-ninja-muted hover:border-ninja-accent/40")}>
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-ninja-muted text-sm">
            {loading ? "Loading live history…" : "No closed trades yet."}
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-ninja-border/40">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: ASSETS[t.asset]?.color ?? "#fff" }}>{t.asset}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold", t.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>{t.direction.toUpperCase()}</span>
                  </div>
                  <div className="text-[10px] text-ninja-muted/70 font-mono mt-0.5">
                    {t.entryPrice ? `$${t.entryPrice.toFixed(t.entryPrice < 1 ? 5 : 2)}` : "—"} → {t.exitPrice ? `$${t.exitPrice.toFixed(t.exitPrice < 1 ? 5 : 2)}` : "—"} · {fmtTime(t.time)}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className={cn("font-bold text-sm", t.pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>{t.pnl >= 0 ? "+" : "-"}${Math.abs(t.pnl).toFixed(2)}</div>
                  {t.pnlPercent != null && <div className={cn("text-[10px]", t.pnl >= 0 ? "text-ninja-green/70" : "text-ninja-red/70")}>{t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(1)}%</div>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-ninja-border bg-ninja-border/10">
                <tr className="text-ninja-muted">
                  <th className="text-left px-4 py-3">Asset</th>
                  <th className="text-left px-4 py-3">Side</th>
                  <th className="text-right px-4 py-3">Entry</th>
                  <th className="text-right px-4 py-3">Exit</th>
                  <th className="text-right px-4 py-3">Size</th>
                  <th className="text-right px-4 py-3">PnL</th>
                  <th className="text-right px-4 py-3">Mode</th>
                  <th className="text-right px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-ninja-border/30 hover:bg-ninja-border/10">
                    <td className="px-4 py-3"><span className="font-bold" style={{ color: ASSETS[t.asset]?.color ?? "#fff" }}>{t.asset}</span></td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded font-bold", t.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                        {t.direction === "long" ? "↑" : "↓"} {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ninja-muted">{t.entryPrice ? `$${t.entryPrice.toLocaleString(undefined, { maximumFractionDigits: t.entryPrice < 1 ? 5 : 2 })}` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{t.exitPrice ? `$${t.exitPrice.toLocaleString(undefined, { maximumFractionDigits: t.exitPrice < 1 ? 5 : 2 })}` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-ninja-muted">{t.size.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={t.pnl >= 0 ? "text-ninja-green" : "text-ninja-red"}>{t.pnl >= 0 ? "+" : "-"}${Math.abs(t.pnl).toFixed(2)}</span>
                      {t.pnlPercent != null && <span className={cn("ml-1.5 text-[10px]", t.pnl >= 0 ? "text-ninja-green/70" : "text-ninja-red/70")}>({t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(1)}%)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", t.mode === "paper" ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400")}>{t.mode}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-ninja-muted">{fmtTime(t.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      <p className="text-ninja-muted/50 text-[11px]">Live history from your Hyperliquid fills (closing trades).</p>
    </div>
  );
}
