"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ScanEye, Send, Loader2, Sparkles } from "lucide-react";

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
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ scanned: number; ts: number } | null>(null);
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
      else { setAnswer(d.answer); setMeta({ scanned: d.scanned, ts: d.ts }); }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

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
    </div>
  );
}
