"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useOrderFlow } from "@/hooks/useOrderFlow";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";

const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;

interface Ctx { markPx: number; prevDayPx: number; funding: number; openInterest: number; dayNtlVlm: number; }

export function OrderFlow() {
  const selectedAsset = useStore((s) => s.selectedAsset);
  const coin = ASSETS[selectedAsset]?.hlCoin ?? selectedAsset;
  const flow = useOrderFlow(coin);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const prevOi = useRef<{ oi: number; px: number } | null>(null);
  const [bias, setBias] = useState<string | null>(null);

  // Poll funding / OI; infer fresh longs vs shorts from OI Δ vs price Δ
  useEffect(() => {
    prevOi.current = null;
    setCtx(null); setBias(null);
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/hl/flow?coin=${encodeURIComponent(coin)}`);
        const d = await r.json();
        if (cancelled || d.error) return;
        setCtx(d);
        const prev = prevOi.current;
        if (prev) {
          const dOi = d.openInterest - prev.oi;
          const dPx = d.markPx - prev.px;
          const oiPct = prev.oi ? Math.abs(dOi / prev.oi) : 0;
          if (oiPct > 0.0005) {
            if (dOi > 0 && dPx > 0) setBias("Fresh longs");
            else if (dOi > 0 && dPx < 0) setBias("Fresh shorts");
            else if (dOi < 0 && dPx > 0) setBias("Short covering");
            else if (dOi < 0 && dPx < 0) setBias("Longs exiting");
          }
        }
        prevOi.current = { oi: d.openInterest, px: d.markPx };
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [coin]);

  const total = flow.buyVol + flow.sellVol;
  const buyPct = total > 0 ? (flow.buyVol / total) * 100 : 50;
  const sellPct = 100 - buyPct;
  const oiUsd = ctx ? ctx.openInterest * ctx.markPx : 0;
  const fundingPct = ctx ? ctx.funding * 100 : 0; // hourly %

  const biasColor = bias === "Fresh longs" || bias === "Short covering" ? "text-ninja-green"
    : bias === "Fresh shorts" || bias === "Longs exiting" ? "text-ninja-red" : "text-ninja-muted";

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-ninja-accent" />
          <span className="text-sm font-bold text-ninja-text">Order Flow</span>
          <span className="text-xs font-bold" style={{ color: ASSETS[selectedAsset]?.color }}>{selectedAsset}</span>
        </div>
        <span className={cn("flex items-center gap-1 text-[10px]", flow.connected ? "text-ninja-green" : "text-ninja-muted")}>
          <span className={cn("w-1.5 h-1.5 rounded-full", flow.connected ? "bg-ninja-green animate-pulse" : "bg-ninja-muted")} />
          {flow.connected ? "live · 2m" : "connecting…"}
        </span>
      </div>

      {/* Taker buy/sell pressure meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ninja-green font-bold flex items-center gap-1"><TrendingUp size={11} /> Buys {buyPct.toFixed(0)}%</span>
          <span className="text-ninja-red font-bold flex items-center gap-1">Sells {sellPct.toFixed(0)}% <TrendingDown size={11} /></span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-ninja-border">
          <div className="bg-ninja-green transition-all duration-500" style={{ width: `${buyPct}%` }} />
          <div className="bg-ninja-red transition-all duration-500" style={{ width: `${sellPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-ninja-muted">
          <span>{fmtUsd(flow.buyVol)} · {flow.buyCount} buys</span>
          <span>{flow.sellCount} sells · {fmtUsd(flow.sellVol)}</span>
        </div>
      </div>

      {/* Fresh position bias + funding + OI */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Bias (OI)</div>
          <div className={cn("font-bold text-[11px]", biasColor)}>{bias ?? "—"}</div>
        </div>
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Funding/h</div>
          <div className={cn("font-mono font-bold", fundingPct >= 0 ? "text-ninja-green" : "text-ninja-red")}>
            {ctx ? `${fundingPct >= 0 ? "+" : ""}${fundingPct.toFixed(4)}%` : "—"}
          </div>
        </div>
        <div className="bg-ninja-bg/50 rounded-lg p-2">
          <div className="text-ninja-muted mb-0.5">Open Int.</div>
          <div className="font-mono font-bold text-ninja-text">{ctx ? fmtUsd(oiUsd) : "—"}</div>
        </div>
      </div>

      {/* Recent prints tape */}
      {flow.tape.length > 0 && (
        <div className="space-y-0.5 max-h-28 overflow-y-auto font-mono">
          {flow.tape.map((t, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className={t.side === "buy" ? "text-ninja-green" : "text-ninja-red"}>
                {t.side === "buy" ? "BUY " : "SELL"}
              </span>
              <span className="text-ninja-muted">${t.px.toLocaleString(undefined, { maximumFractionDigits: t.px < 1 ? 5 : 2 })}</span>
              <span className="text-ninja-text">{fmtUsd(t.usd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
