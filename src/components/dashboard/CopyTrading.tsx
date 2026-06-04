"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { useCopyTrader } from "@/hooks/useCopyTrader";
import { cn } from "@/lib/utils";
import { ASSETS } from "@/types";
import { Users, AlertTriangle, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

// Runs the mirror engine in the background (mount once, e.g. in DashboardContent)
export function CopyTraderRunner() {
  useCopyTrader();
  return null;
}

interface TargetPos { coin: string; direction: "long" | "short"; size: number; entryPx: number; leverage: number; unrealizedPnl: number; }

export function CopyTrading() {
  const { copyTrade, setCopyTrade, tradingMode, openPositions } = useStore();
  const c = copyTrade;
  const isLive = tradingMode === "live";

  const [preview, setPreview] = useState<{ accountValue: number; positions: TargetPos[] } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validAddr = /^0x[0-9a-fA-F]{40}$/.test(c.targetAddress.trim());
  const copies = openPositions.filter((p) => p.isOpen && p.id.startsWith("copy_"));

  // Poll the target's positions for the preview while a valid address is set
  useEffect(() => {
    if (!validAddr) { setPreview(null); return; }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/hl/trader?address=${c.targetAddress.trim()}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.error) { setPreviewErr(d.error); setPreview(null); }
        else { setPreviewErr(null); setPreview({ accountValue: d.accountValue, positions: d.positions }); }
      } catch (e: any) { if (!cancelled) setPreviewErr(e.message); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [c.targetAddress, validAddr]);

  const sym = (coin: string) => coin.replace(/^xyz:/, "");

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-3.5">
      {/* Header + master toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={15} className={c.enabled ? "text-ninja-accent" : "text-ninja-muted"} />
          <span className="font-bold text-sm text-ninja-text">Copy Trading</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold", c.enabled ? "text-ninja-accent" : "text-ninja-muted")}>
            {c.enabled ? "ON" : "OFF"}
          </span>
          <button
            onClick={() => setCopyTrade({ enabled: !c.enabled })}
            disabled={!validAddr}
            title={validAddr ? "" : "Enter a valid wallet address first"}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
              c.enabled ? "bg-ninja-accent" : "bg-ninja-border",
              !validAddr && "opacity-40 cursor-not-allowed"
            )}
          >
            <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
              c.enabled ? "translate-x-[22px]" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      <p className="text-ninja-muted/70 text-xs leading-relaxed">
        Mirror any Hyperliquid trader. Paste their wallet — the bot copies new positions
        they open (sized by your rules) and closes when they exit. {isLive ? "Live: real orders via your API key." : "Paper mode: simulated."}
      </p>

      {/* Target wallet */}
      <div>
        <label className="label">Target wallet address</label>
        <input
          value={c.targetAddress}
          onChange={(e) => setCopyTrade({ targetAddress: e.target.value })}
          placeholder="0x…"
          spellCheck={false}
          className={cn("input font-mono text-xs", c.targetAddress && !validAddr && "border-red-500/50")}
        />
        {c.targetAddress && !validAddr && <p className="text-red-400 text-[10px] mt-1">Not a valid 0x address</p>}
      </div>

      {/* Sizing mode */}
      <div className="space-y-2">
        <label className="label mb-0">Position sizing</label>
        <div className="grid grid-cols-3 gap-1">
          {([
            { id: "proportional", label: "Match %" },
            { id: "multiplier", label: "× Notional" },
            { id: "fixed", label: "Fixed $" },
          ] as const).map((m) => (
            <button
              key={m.id}
              onClick={() => setCopyTrade({ sizingMode: m.id })}
              className={cn("py-1.5 rounded-md text-xs font-bold transition-all border",
                c.sizingMode === m.id ? "bg-ninja-accent/20 text-ninja-accent border-ninja-accent/40"
                  : "bg-ninja-bg/40 text-ninja-muted border-transparent hover:text-ninja-text")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-ninja-muted/60 text-[10px]">
          {c.sizingMode === "proportional" && "Each copy takes the same % of your account as it is of theirs."}
          {c.sizingMode === "multiplier" && "Copy their position notional × your multiplier."}
          {c.sizingMode === "fixed" && "Every copied trade uses a fixed margin amount."}
        </p>
      </div>

      {/* Mode-specific input */}
      {c.sizingMode === "multiplier" && (
        <div>
          <label className="label">Notional multiplier</label>
          <input type="number" step="0.1" value={c.multiplier}
            onChange={(e) => setCopyTrade({ multiplier: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="input" />
        </div>
      )}
      {c.sizingMode === "fixed" && (
        <div>
          <label className="label">Margin per trade (USDC)</label>
          <input type="number" step="1" value={c.fixedUsd}
            onChange={(e) => setCopyTrade({ fixedUsd: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="input" />
        </div>
      )}

      {/* Caps */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Max margin / trade</label>
          <input type="number" step="1" value={c.maxMarginPerTrade}
            onChange={(e) => setCopyTrade({ maxMarginPerTrade: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="input" />
        </div>
        <div>
          <label className="label">Leverage cap</label>
          <input type="number" step="1" value={c.leverageCap}
            onChange={(e) => setCopyTrade({ leverageCap: Math.max(1, parseFloat(e.target.value) || 1) })}
            className="input" />
        </div>
      </div>

      {/* Long/short toggles */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setCopyTrade({ copyLongs: !c.copyLongs })}
          className={cn("py-1.5 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
            c.copyLongs ? "bg-green-500/15 text-green-400 border-green-500/40" : "bg-ninja-bg/40 text-ninja-muted border-transparent")}>
          <TrendingUp size={12} /> Copy Longs
        </button>
        <button onClick={() => setCopyTrade({ copyShorts: !c.copyShorts })}
          className={cn("py-1.5 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-1.5",
            c.copyShorts ? "bg-red-500/15 text-red-400 border-red-500/40" : "bg-ninja-bg/40 text-ninja-muted border-transparent")}>
          <TrendingDown size={12} /> Copy Shorts
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between text-xs bg-ninja-bg/40 rounded-lg px-2.5 py-2">
        <span className="text-ninja-muted">
          {c.enabled ? (loading ? "Checking target…" : "Watching target") : "Idle"}
        </span>
        <span className="text-ninja-text font-mono">{copies.length} copied</span>
      </div>

      {/* Target preview */}
      {validAddr && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ninja-muted uppercase tracking-wide">Target positions</span>
            {preview && <span className="text-[10px] text-ninja-muted/60 font-mono">equity ${preview.accountValue.toFixed(2)}</span>}
          </div>
          {previewErr ? (
            <div className="text-xs text-red-400">{previewErr}</div>
          ) : !preview || preview.positions.length === 0 ? (
            <div className="text-xs text-ninja-muted/60 py-1">{loading ? "Loading…" : "No open positions"}</div>
          ) : (
            <div className="space-y-1">
              {preview.positions.map((p) => {
                const s = sym(p.coin);
                const isLong = p.direction === "long";
                return (
                  <div key={p.coin} className={cn("flex items-center justify-between text-xs rounded-lg p-2 border",
                    isLong ? "border-green-500/25 bg-green-500/5" : "border-red-500/25 bg-red-500/5")}>
                    <div className="flex items-center gap-1.5">
                      {isLong ? <TrendingUp size={11} className="text-ninja-green" /> : <TrendingDown size={11} className="text-ninja-red" />}
                      <span className="font-bold font-mono" style={{ color: ASSETS[s]?.color }}>{s}</span>
                      <span className="text-ninja-muted">{p.leverage}x</span>
                      {!ASSETS[s] && <span className="text-yellow-400/70 text-[10px]">(not supported)</span>}
                    </div>
                    <span className={cn("font-mono", p.unrealizedPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                      {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Live warning */}
      {c.enabled && isLive && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-300 flex items-start gap-2 leading-relaxed">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          Live copy trading places real orders mirroring this wallet. A −23% safety stop applies to each copied position. Disable anytime with the toggle or Emergency Stop.
        </div>
      )}

      {/* Vault note */}
      <a href="https://app.hyperliquid.xyz/vaults" target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[11px] text-ninja-muted hover:text-ninja-accent transition-colors">
        <ExternalLink size={11} /> Prefer native copy trading? Hyperliquid Vaults
      </a>
    </div>
  );
}
