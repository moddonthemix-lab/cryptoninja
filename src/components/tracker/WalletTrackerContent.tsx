"use client";

import { useEffect, useState, useCallback } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { ASSETS } from "@/types";
import { Eye, Plus, X, TrendingUp, TrendingDown, Copy as CopyIcon, RefreshCw, CheckCircle } from "lucide-react";

interface TraderPos {
  coin: string; direction: "long" | "short"; size: number;
  entryPx: number; leverage: number; positionValue: number; unrealizedPnl: number;
  openedAt: number | null;
}
interface TraderData { address: string; accountValue: number; positions: TraderPos[]; }

const sym = (coin: string) => coin.replace(/^xyz:/, "");

// Compact "time ago" + absolute date for a ms timestamp
function fmtAge(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const rel = d > 0 ? `${d}d` : h > 0 ? `${h}h` : m > 0 ? `${m}m` : "now";
  const date = new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${rel} · ${date}`;
}

function WalletCard({ address, label, onRemove, tradable }: { address: string; label: string; onRemove: () => void; tradable: Set<string> }) {
  const { copyTrade, setCopyTrade } = useStore();
  const [data, setData] = useState<TraderData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wr, setWr] = useState<{ winRate: number; wins: number; losses: number; trades: number } | null>(null);

  // Live win rate (from fills) — cached server-side, refreshed every 5 min
  useEffect(() => {
    let c = false;
    const load = () => fetch(`/api/hl/winrate?address=${address}`).then((r) => r.json())
      .then((d) => { if (!c && !d.error) setWr(d); }).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [address]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/hl/trader?address=${address}`);
      const d = await r.json();
      if (d.error) { setErr(d.error); setData(null); }
      else { setErr(null); setData(d); }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const totalPnl = data?.positions.reduce((s, p) => s + p.unrealizedPnl, 0) ?? 0;
  const isCopying = copyTrade.enabled && copyTrade.targetAddress.toLowerCase() === address.toLowerCase();
  const sameWallet = copyTrade.targetAddress.toLowerCase() === address.toLowerCase();

  // Wallet-level: copy ALL of this wallet's positions (clears any asset filter)
  const toggleCopy = () => {
    if (isCopying) setCopyTrade({ enabled: false, assetFilter: [] });
    else setCopyTrade({ targetAddress: address, enabled: true, assetFilter: [] });
  };

  // Is a specific position currently being copied?
  const isPosCopied = (s: string) =>
    isCopying && (copyTrade.assetFilter.length === 0 || copyTrade.assetFilter.includes(s));

  // Per-position: copy just this one (toggles membership in the asset filter)
  const toggleCopyPos = (s: string) => {
    const ct = useStore.getState().copyTrade;
    if (!(sameWallet && ct.enabled)) {
      setCopyTrade({ targetAddress: address, enabled: true, assetFilter: [s] });
      return;
    }
    let filter: string[];
    if (ct.assetFilter.length === 0) filter = [s];                    // was "all" → narrow to this
    else if (ct.assetFilter.includes(s)) filter = ct.assetFilter.filter((x) => x !== s);
    else filter = [...ct.assetFilter, s];
    if (filter.length === 0) setCopyTrade({ enabled: false, assetFilter: [] });
    else setCopyTrade({ assetFilter: filter });
  };

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {label && <span className="font-bold text-sm text-ninja-text truncate">{label}</span>}
            {isCopying && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ninja-accent/20 text-ninja-accent flex items-center gap-1">
                <CheckCircle size={9} /> COPYING
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ninja-muted/70 text-[11px] font-mono break-all select-all">{address}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(address)}
              title="Copy address"
              className="text-ninja-muted hover:text-ninja-accent flex-shrink-0"
            >
              <CopyIcon size={11} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={load} title="Refresh" className="p-1.5 rounded-md text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/40">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={toggleCopy}
            className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all",
              isCopying ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-ninja-accent text-white hover:bg-ninja-accent-hover")}>
            <CopyIcon size={11} /> {isCopying ? "Stop" : "Copy All"}
          </button>
          <button onClick={onRemove} title="Remove" className="p-1.5 rounded-md text-ninja-muted hover:text-red-400 hover:bg-red-500/10">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Balance + PnL + win rate */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Equity</div>
          <div className="font-mono font-bold text-ninja-text">${(data?.accountValue ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Win rate</div>
          {wr ? (
            <div className={cn("font-mono font-bold", wr.winRate >= 50 ? "text-ninja-green" : "text-yellow-400")}>
              {wr.winRate.toFixed(0)}%
              <span className="text-ninja-muted/50 ml-1 text-[10px] font-normal">{wr.wins}W/{wr.losses}L</span>
            </div>
          ) : <div className="text-ninja-muted/40 font-mono">…</div>}
        </div>
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Open PnL</div>
          <div className={cn("font-mono font-bold", totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Positions</div>
          <div className="font-mono font-bold text-ninja-text">{data?.positions.length ?? 0}</div>
        </div>
      </div>

      {/* Positions */}
      {err ? (
        <div className="text-xs text-red-400">{err}</div>
      ) : !data || data.positions.length === 0 ? (
        <div className="text-xs text-ninja-muted/60 py-1">{loading ? "Loading…" : "No open positions"}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ninja-muted border-b border-ninja-border/60 uppercase tracking-wide">
                <th className="text-left py-1.5">Asset</th>
                <th className="text-left py-1.5">Side</th>
                <th className="text-right py-1.5">Entry</th>
                <th className="text-right py-1.5">Notional</th>
                <th className="text-right py-1.5">PnL</th>
                <th className="text-right py-1.5">Opened</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => {
                const s = sym(p.coin);
                const isLong = p.direction === "long";
                return (
                  <tr key={p.coin} className={cn("border-b border-ninja-border/30",
                    isLong ? "border-l-2 border-l-green-500/60" : "border-l-2 border-l-red-500/60")}>
                    <td className="py-1.5 pl-2">
                      <span className="font-bold font-mono" style={{ color: ASSETS[s]?.color }}>{s}</span>
                      {!tradable.has(s) && <span className="text-yellow-400/60 text-[10px] ml-1">(n/a)</span>}
                    </td>
                    <td className="py-1.5">
                      <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold",
                        isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                        {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{p.leverage}x
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-mono text-ninja-muted">${p.entryPx.toFixed(p.entryPx < 1 ? 5 : 2)}</td>
                    <td className="py-1.5 text-right font-mono text-ninja-text">${p.positionValue.toFixed(2)}</td>
                    <td className={cn("py-1.5 text-right font-mono font-bold", p.unrealizedPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                      {p.unrealizedPnl >= 0 ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-ninja-muted/80 whitespace-nowrap text-[11px]">{fmtAge(p.openedAt)}</td>
                    <td className="py-1.5 pl-2 text-right">
                      {tradable.has(s) && (
                        <button
                          onClick={() => toggleCopyPos(s)}
                          title={isPosCopied(s) ? "Stop copying this position" : "Copy this position"}
                          className={cn("inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-bold transition-all",
                            isPosCopied(s) ? "border-ninja-accent/50 text-ninja-accent bg-ninja-accent/10"
                              : "border-ninja-border text-ninja-muted hover:text-ninja-accent hover:border-ninja-accent/50")}
                        >
                          {isPosCopied(s) ? <><CheckCircle size={10} /> Copying</> : <><CopyIcon size={10} /> Copy</>}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WalletTrackerContent() {
  const { trackedWallets, addTrackedWallet, removeTrackedWallet } = useStore();
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [tradable, setTradable] = useState<Set<string>>(new Set());

  // All Hyperliquid-tradable coins (so any perp can be copied, not just curated)
  useEffect(() => {
    fetch("/api/hl/meta").then((r) => r.json()).then((m) => {
      if (m && !m.error) setTradable(new Set(Object.keys(m)));
    }).catch(() => {});
  }, []);

  const valid = /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
  const full = trackedWallets.length >= 5;
  const dup = trackedWallets.some((w) => w.address.toLowerCase() === addr.trim().toLowerCase());

  const add = () => {
    if (!valid || full || dup) return;
    addTrackedWallet(addr.trim(), label.trim());
    setAddr(""); setLabel("");
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-2">
        <Eye size={20} className="text-ninja-accent" />
        <h1 className="text-lg font-bold text-ninja-text">Wallet Tracker</h1>
        <span className="text-xs text-ninja-muted">({trackedWallets.length}/5)</span>
      </div>
      <p className="text-ninja-muted text-sm">
        Track up to 5 Hyperliquid wallets — see their live positions, size, leverage, PnL and equity.
        Hit <b className="text-ninja-text">Copy</b> on any wallet to start mirroring it (configure sizing in the COPY tab).
      </p>

      {/* Add wallet */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <input
            value={addr} onChange={(e) => setAddr(e.target.value)}
            placeholder="Wallet address 0x…" spellCheck={false}
            className={cn("input font-mono text-xs", addr && !valid && "border-red-500/50")}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="input text-xs sm:w-40"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-red-400">
            {addr && !valid ? "Not a valid 0x address" : dup ? "Already tracked" : full ? "Max 5 wallets — remove one first" : ""}
          </span>
          <button onClick={add} disabled={!valid || full || dup}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
              !valid || full || dup ? "bg-ninja-border/40 text-ninja-muted/50 cursor-not-allowed" : "bg-ninja-accent text-white hover:bg-ninja-accent-hover")}>
            <Plus size={13} /> Add wallet
          </button>
        </div>
      </div>

      {/* Cards */}
      {trackedWallets.length === 0 ? (
        <div className="text-center text-ninja-muted text-sm py-10 border border-dashed border-ninja-border rounded-xl">
          No wallets tracked yet. Paste an address above to start.
        </div>
      ) : (
        <div className="space-y-3">
          {trackedWallets.map((w) => (
            <WalletCard key={w.address} address={w.address} label={w.label} onRemove={() => removeTrackedWallet(w.address)} tradable={tradable} />
          ))}
        </div>
      )}
    </div>
  );
}
