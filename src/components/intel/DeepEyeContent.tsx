"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { ScanEye, Send, Loader2, Sparkles, Eye, Copy as CopyIcon } from "lucide-react";

interface IntelWallet { address: string; name: string | null; accountValue: number; roi: number; assets: string[]; }

const SUGGESTIONS = [
  "Which top wallets are trading stocks?",
  "Who's holding oil (CL/Brent)?",
  "Any wallets in SpaceX (SPCX)?",
  "Who has the most volume?",
  "Biggest shorts open right now?",
  "Most profitable wallets this month?",
  "Who's net long crypto vs short?",
];

export function DeepEyeContent() {
  const { addTrackedWallet, setCopyTrade, trackedWallets, copyTrade } = useStore();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ scanned: number; ts: number } | null>(null);
  const [wallets, setWallets] = useState<IntelWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (question?: string) => {
    const text = (question ?? q).trim();
    if (!text || loading) return;
    setQ(text); setLoading(true); setErr(null); setAnswer(null);
    try {
      const r = await fetch("/api/ai/deepeye", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else { setAnswer(d.answer); setMeta({ scanned: d.scanned, ts: d.ts }); setWallets(d.wallets ?? []); }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const isTracked = (a: string) => trackedWallets.some((w) => w.address.toLowerCase() === a.toLowerCase());
  const isCopying = (a: string) => copyTrade.enabled && copyTrade.targetAddress.toLowerCase() === a.toLowerCase();

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-2">
        <ScanEye size={22} className="text-ninja-accent" />
        <h1 className="text-lg font-bold text-ninja-text">Deep Eye <span className="text-ninja-accent">👁️</span></h1>
      </div>
      <p className="text-ninja-muted text-sm">
        Ask anything about Hyperliquid's top traders — who's in stocks, oil, SpaceX; who has the most volume;
        biggest shorts; most profitable. Answers come from a live snapshot of the top wallets.
      </p>

      {/* Ask box */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask Deep Eye…"
            className="input flex-1"
          />
          <button
            onClick={() => ask()}
            disabled={loading || !q.trim()}
            className={cn("flex items-center gap-1.5 px-4 rounded-lg text-sm font-bold transition-all",
              loading || !q.trim() ? "bg-ninja-border/40 text-ninja-muted" : "bg-ninja-accent text-white hover:bg-ninja-accent-hover")}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={loading}
              className="text-[11px] px-2 py-1 rounded-full border border-ninja-border text-ninja-muted hover:text-ninja-accent hover:border-ninja-accent/50 transition-all">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Answer */}
      {loading && (
        <div className="flex items-center gap-2 text-ninja-muted text-sm">
          <Loader2 size={15} className="animate-spin" /> Scanning top wallets and analyzing…
        </div>
      )}
      {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{err}</div>}
      {answer && !loading && (
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-ninja-accent font-bold">
            <Sparkles size={13} /> Deep Eye
          </div>
          <div className="text-sm text-ninja-text whitespace-pre-wrap leading-relaxed">{answer}</div>
          {meta && (
            <div className="text-[11px] text-ninja-muted/60 pt-2 border-t border-ninja-border/40">
              From the top {meta.scanned} wallets by 30d volume · snapshot {Math.round((Date.now() - meta.ts) / 60000)}m old.
              Limited to leaderboard wallets, not every wallet on Hyperliquid.
            </div>
          )}
        </div>
      )}

      {/* Wallets in the snapshot — one-tap Track / Copy */}
      {answer && !loading && wallets.length > 0 && (
        <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 space-y-1.5">
          <div className="text-xs font-bold text-ninja-muted uppercase tracking-wide mb-1">Wallets — tap to Track or Copy</div>
          <div className="max-h-72 overflow-y-auto divide-y divide-ninja-border/40">
            {wallets.map((w) => (
              <div key={w.address} className="flex items-center gap-2 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-ninja-text">{w.name || short(w.address)}</span>
                    <span className={cn("font-mono text-[10px]", w.roi >= 0 ? "text-ninja-green" : "text-ninja-red")}>{w.roi >= 0 ? "+" : ""}{w.roi.toFixed(0)}%</span>
                  </div>
                  <div className="text-[10px] text-ninja-muted/60 truncate">${w.accountValue.toFixed(0)} · {w.assets.join(", ") || "flat"}</div>
                </div>
                <button onClick={() => addTrackedWallet(w.address, w.name || "")}
                  disabled={isTracked(w.address) || trackedWallets.length >= 10}
                  className={cn("flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-bold transition-all",
                    isTracked(w.address) ? "border-ninja-accent/40 text-ninja-accent bg-ninja-accent/10"
                      : trackedWallets.length >= 10 ? "border-ninja-border text-ninja-muted/40 cursor-not-allowed"
                      : "border-ninja-border text-ninja-muted hover:text-ninja-accent hover:border-ninja-accent/50")}>
                  <Eye size={10} /> {isTracked(w.address) ? "Tracked" : "Track"}
                </button>
                <button onClick={() => setCopyTrade({ targetAddress: w.address, enabled: true, assetFilter: [] })}
                  className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all",
                    isCopying(w.address) ? "bg-ninja-accent/15 text-ninja-accent" : "bg-ninja-accent text-white hover:bg-ninja-accent-hover")}>
                  <CopyIcon size={10} /> {isCopying(w.address) ? "Copying" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
