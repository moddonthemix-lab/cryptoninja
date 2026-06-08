"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { TrendingUp, TrendingDown, X, GripHorizontal, Layers } from "lucide-react";

interface Row {
  id: string; asset: string; direction: "long" | "short";
  size: number; entry: number; mark: number; pnl: number; pnlPct: number; isLive: boolean;
}

export function FloatingPositions() {
  const openPositions = useStore((s) => s.openPositions);
  const marketData = useStore((s) => s.marketData);
  const closePosition = useStore((s) => s.closePosition);
  const hl = useHyperliquid();
  const isLive = true; // live-only platform

  const [expanded, setExpanded] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Initial position: bottom-right, clamped to the viewport (mobile-safe)
  useEffect(() => {
    const w = Math.min(260, window.innerWidth * 0.88);
    setPos({ x: Math.max(8, window.innerWidth - w - 12), y: Math.max(60, window.innerHeight - 340) });
  }, []);

  const rows: Row[] = isLive
    ? hl.livePositions.map((p) => {
        const szi = parseFloat(p.szi);
        const asset = p.coin.replace(/^xyz:/, "");
        const size = Math.abs(szi);
        const entry = parseFloat(p.entryPx);
        const upnl = parseFloat(p.unrealizedPnl);
        const lev = p.leverage?.value ?? 1;
        const mark = marketData[asset as Asset]?.price ?? (szi !== 0 ? entry + upnl / szi : entry);
        const margin = (size * entry) / lev;
        return { id: p.coin, asset, direction: szi >= 0 ? "long" : "short", size, entry, mark, pnl: upnl, pnlPct: margin > 0 ? (upnl / margin) * 100 : 0, isLive: true };
      })
    : openPositions.filter((p) => p.isOpen).map((p) => {
        const mark = marketData[p.asset]?.price ?? p.entryPrice;
        const diff = p.direction === "long" ? mark - p.entryPrice : p.entryPrice - mark;
        const pnlPct = (diff / p.entryPrice) * 100 * p.leverage;
        const margin = (p.size * p.entryPrice) / p.leverage;
        return { id: p.id, asset: p.asset, direction: p.direction as "long" | "short", size: p.size, entry: p.entryPrice, mark, pnl: margin * (pnlPct / 100), pnlPct, isLive: false };
      });

  if (!pos || rows.length === 0) return null;

  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = Math.max(8, Math.min(window.innerWidth - 60, e.clientX - drag.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const close = async (r: Row) => {
    setClosing(r.id);
    try {
      if (r.isLive) await hl.closeLivePosition({ asset: r.asset as Asset, direction: r.direction, size: r.size, currentPrice: r.mark });
      else closePosition(r.id, r.mark, "manual");
      notify(
        `🟦 <b>MANUAL CLOSE</b> · ${r.isLive ? "LIVE" : "PAPER"}\n` +
        `Sold ${r.direction.toUpperCase()} <b>${r.asset}</b> @ $${r.mark.toFixed(4)}\n` +
        `PnL: <b>${r.pnl >= 0 ? "+" : "-"}$${Math.abs(r.pnl).toFixed(2)}</b> (${r.pnlPct >= 0 ? "+" : ""}${r.pnlPct.toFixed(1)}%)`
      );
    } catch { /* surfaced elsewhere */ }
    setTimeout(() => setClosing(null), 500);
  };

  return (
    <div
      className="fixed z-[60] w-[min(260px,88vw)] select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="bg-ninja-card border border-ninja-accent/40 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Drag handle / header */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex items-center gap-2 px-3 py-2 bg-ninja-bg/60 cursor-grab active:cursor-grabbing border-b border-ninja-border/60"
        >
          <GripHorizontal size={13} className="text-ninja-muted flex-shrink-0" />
          <Layers size={13} className="text-ninja-accent flex-shrink-0" />
          <span className="text-xs font-bold text-ninja-text">Positions ({rows.length})</span>
          <span className={cn("ml-auto text-xs font-mono font-bold", totalPnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
            {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(2)}
          </span>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-ninja-muted hover:text-ninja-text text-xs font-bold ml-1"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "–" : "+"}
          </button>
        </div>

        {/* Position rows */}
        {expanded && (
          <div className="max-h-72 overflow-y-auto divide-y divide-ninja-border/40">
            {rows.map((r) => {
              const isLong = r.direction === "long";
              return (
                <div key={r.id} className={cn("flex items-center gap-2 px-3 py-2 text-xs", closing === r.id && "opacity-40")}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isLong ? <TrendingUp size={12} className="text-ninja-green flex-shrink-0" /> : <TrendingDown size={12} className="text-ninja-red flex-shrink-0" />}
                    <span className="font-bold font-mono" style={{ color: ASSETS[r.asset]?.color }}>{r.asset}</span>
                  </div>
                  <div className="ml-auto text-right">
                    <div className={cn("font-mono font-bold", r.pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                      {r.pnl >= 0 ? "+" : ""}${Math.abs(r.pnl).toFixed(2)}
                    </div>
                    <div className={cn("font-mono text-[10px]", r.pnlPct >= 0 ? "text-ninja-green/70" : "text-ninja-red/70")}>
                      {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(1)}%
                    </div>
                  </div>
                  <button
                    onClick={() => close(r)}
                    disabled={closing === r.id}
                    title="Close at market"
                    className="flex items-center gap-1 px-2 py-1 rounded border border-ninja-border text-ninja-muted hover:border-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all font-bold flex-shrink-0"
                  >
                    <X size={10} /> Close
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
