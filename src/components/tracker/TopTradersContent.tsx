"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Trophy, Eye, Copy as CopyIcon, Search, Loader2, ExternalLink } from "lucide-react";

interface LbRow { address: string; name: string | null; accountValue: number; pnl: number; roi: number; vlm: number; }
interface WinRate { winRate: number; wins: number; losses: number; trades: number; realized: number; }

const WINDOWS = [
  { id: "day", label: "24h" }, { id: "week", label: "7d" },
  { id: "month", label: "30d" }, { id: "allTime", label: "All" },
] as const;

const SCAN_COUNT = 60;   // wallets to scan win rate for
const CONCURRENCY = 5;   // parallel winrate fetches
const fmtUsd = (n: number) =>
  Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function TopTradersContent() {
  const { addTrackedWallet, setCopyTrade, trackedWallets } = useStore();
  const [window, setWindow] = useState<typeof WINDOWS[number]["id"]>("month");
  const [rows, setRows] = useState<LbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [wr, setWr] = useState<Record<string, WinRate>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [minTrades, setMinTrades] = useState(20);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null); setScanned(false); setWr({});
    fetch(`/api/hl/leaderboard?window=${window}&limit=100`)
      .then((r) => r.json())
      .then((d) => { if (cancelled) return; if (d.error) setErr(d.error); else setRows(d.rows ?? []); })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [window]);

  const scan = useCallback(async () => {
    setScanning(true); setProgress(0);
    const targets = rows.slice(0, SCAN_COUNT);
    const results: Record<string, WinRate> = {};
    let done = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift()!;
        try {
          const d = await fetch(`/api/hl/winrate?address=${row.address}`).then((r) => r.json());
          if (!d.error) results[row.address.toLowerCase()] = d;
        } catch { /* skip */ }
        done++; setProgress(done);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setWr(results); setScanned(true); setScanning(false);
  }, [rows]);

  // Display list: ranked by win rate after a scan, else by ROI (leaderboard order)
  const display = scanned
    ? rows
        .map((r) => ({ r, w: wr[r.address.toLowerCase()] }))
        .filter((x) => x.w && x.w.trades >= minTrades)
        .sort((a, b) => b.w!.winRate - a.w!.winRate)
        .slice(0, 20)
    : rows.slice(0, 20).map((r) => ({ r, w: wr[r.address.toLowerCase()] }));

  const isTracked = (a: string) => trackedWallets.some((w) => w.address.toLowerCase() === a.toLowerCase());

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-yellow-400" />
        <h1 className="text-lg font-bold text-ninja-text">Top Traders</h1>
      </div>
      <p className="text-ninja-muted text-sm">
        Hyperliquid's top performers by ROI. Hit <b className="text-ninja-text">Scan win rates</b> to pull each
        trader's fill history and re-rank the best {SCAN_COUNT} by <b className="text-ninja-text">win rate</b> — then Track or Copy the winners.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-ninja-bg/50 rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button key={w.id} onClick={() => setWindow(w.id)}
              className={cn("px-2.5 py-1 rounded-md text-xs font-bold transition-all",
                window === w.id ? "bg-ninja-accent text-white" : "text-ninja-muted hover:text-ninja-text")}>
              {w.label}
            </button>
          ))}
        </div>
        <button onClick={scan} disabled={scanning || rows.length === 0}
          className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
            scanning ? "bg-ninja-border/40 text-ninja-muted" : "bg-ninja-accent text-white hover:bg-ninja-accent-hover")}>
          {scanning ? <><Loader2 size={13} className="animate-spin" /> Scanning {progress}/{Math.min(SCAN_COUNT, rows.length)}</> : <><Search size={13} /> Scan win rates</>}
        </button>
        {scanned && (
          <label className="flex items-center gap-1.5 text-xs text-ninja-muted">
            min trades
            <input type="number" value={minTrades} onChange={(e) => setMinTrades(Math.max(0, parseInt(e.target.value) || 0))}
              className="input w-16 py-1 text-xs" />
          </label>
        )}
        {scanned && <span className="text-xs text-ninja-accent font-bold">Top 20 by win rate ↓</span>}
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {loading ? (
        <div className="text-center text-ninja-muted text-sm py-10">Loading leaderboard…</div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="sm:hidden space-y-2">
          {display.map(({ r, w }, i) => (
            <div key={r.address} className="bg-ninja-card border border-ninja-border rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-ninja-text">{i + 1}. {r.name || short(r.address)}</span>
                <span className={cn("font-mono font-bold text-sm", r.roi >= 0 ? "text-ninja-green" : "text-ninja-red")}>{r.roi >= 0 ? "+" : ""}{r.roi.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-ninja-muted">
                <span>Eq {fmtUsd(r.accountValue)} · PnL {r.pnl >= 0 ? "+" : ""}{fmtUsd(r.pnl)}</span>
                <span>{w ? <span className={w.winRate >= 50 ? "text-ninja-green" : "text-yellow-400"}>{w.winRate.toFixed(0)}% · {w.trades}t</span> : "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => addTrackedWallet(r.address, r.name || "")} disabled={isTracked(r.address) || trackedWallets.length >= 10}
                  className={cn("flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded border text-[11px] font-bold",
                    isTracked(r.address) ? "border-ninja-accent/40 text-ninja-accent bg-ninja-accent/10" : "border-ninja-border text-ninja-muted")}>
                  <Eye size={11} /> {isTracked(r.address) ? "Tracked" : "Track"}
                </button>
                <button onClick={() => setCopyTrade({ targetAddress: r.address, enabled: true, assetFilter: [] })}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-ninja-accent text-white text-[11px] font-bold">
                  <CopyIcon size={11} /> Copy
                </button>
              </div>
            </div>
          ))}
          {display.length === 0 && <div className="text-center text-ninja-muted text-xs py-6">No traders match.</div>}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block bg-ninja-card border border-ninja-border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ninja-muted border-b border-ninja-border/60 uppercase tracking-wide">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Trader</th>
                <th className="text-right px-3 py-2">Equity</th>
                <th className="text-right px-3 py-2">ROI</th>
                <th className="text-right px-3 py-2">PnL</th>
                <th className="text-right px-3 py-2">Win rate</th>
                <th className="text-right px-3 py-2">Trades</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {display.map(({ r, w }, i) => (
                <tr key={r.address} className="border-b border-ninja-border/40 hover:bg-ninja-border/20">
                  <td className="px-3 py-2 text-ninja-muted font-mono">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-ninja-text">{r.name || short(r.address)}</span>
                      <a href={`https://app.hyperliquid.xyz/explorer/address/${r.address}`} target="_blank" rel="noopener noreferrer"
                        className="text-ninja-muted hover:text-ninja-accent" title="View on Hyperliquid">
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ninja-text">{fmtUsd(r.accountValue)}</td>
                  <td className={cn("px-3 py-2 text-right font-mono font-bold", r.roi >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                    {r.roi >= 0 ? "+" : ""}{r.roi.toFixed(1)}%
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono", r.pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                    {r.pnl >= 0 ? "+" : ""}{fmtUsd(r.pnl)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    {w ? <span className={w.winRate >= 50 ? "text-ninja-green" : "text-yellow-400"}>{w.winRate.toFixed(0)}%</span> : <span className="text-ninja-muted/40">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ninja-muted">{w ? w.trades : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => addTrackedWallet(r.address, r.name || "")}
                        disabled={isTracked(r.address) || trackedWallets.length >= 5}
                        title={isTracked(r.address) ? "Already tracked" : trackedWallets.length >= 5 ? "Tracker full (5)" : "Add to tracker"}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-bold transition-all",
                          isTracked(r.address) ? "border-ninja-accent/40 text-ninja-accent bg-ninja-accent/10"
                            : trackedWallets.length >= 5 ? "border-ninja-border text-ninja-muted/40 cursor-not-allowed"
                            : "border-ninja-border text-ninja-muted hover:text-ninja-accent hover:border-ninja-accent/50")}>
                        <Eye size={10} /> {isTracked(r.address) ? "Tracked" : "Track"}
                      </button>
                      <button onClick={() => setCopyTrade({ targetAddress: r.address, enabled: true, assetFilter: [] })}
                        title="Copy this trader"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-ninja-accent text-white hover:bg-ninja-accent-hover text-[11px] font-bold">
                        <CopyIcon size={10} /> Copy
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {display.length === 0 && <div className="px-4 py-6 text-center text-ninja-muted text-xs">No traders match (try lowering min trades).</div>}
        </div>
        </>
      )}

      <p className="text-ninja-muted/50 text-[11px]">
        Win rate = share of closing trades with positive realized PnL (from public fills). Scanned across the top {SCAN_COUNT} by ROI;
        not every wallet in the full 1000 is win-rate-scanned to respect rate limits.
      </p>
    </div>
  );
}
