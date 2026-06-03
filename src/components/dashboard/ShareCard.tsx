"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";
import { X, Download, Link as LinkIcon, TrendingUp, TrendingDown } from "lucide-react";

export interface SharePosition {
  asset: Asset;
  direction: "long" | "short";
  leverage: number;
  entryPrice: number;
  markPrice: number;
  pnlPct: number;        // ROE %
}

export function ShareCard({ position, onClose }: { position: SharePosition; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const cfg = ASSETS[position.asset];
  const isLong = position.direction === "long";
  const pnl = position.pnlPct;
  const positive = pnl >= 0;
  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://cryptoninja.app";

  const [text, setText] = useState(
    `Trading $${position.asset} ${position.direction.toUpperCase()} ${position.leverage}x on CryptoNinja 🥷`
  );

  const saveImage = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = `cryptoninja-${position.asset}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const shareX = () => {
    const tweet = `${text}\n\n${positive ? "+" : ""}${pnl.toFixed(1)}% on $${position.asset}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(appUrl)}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-ninja-card border border-ninja-border rounded-2xl p-5 max-w-3xl w-full flex flex-col lg:flex-row gap-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── The card (exported as image) ── */}
        <div
          ref={cardRef}
          className="relative flex-1 rounded-xl overflow-hidden border border-ninja-border bg-gradient-to-br from-ninja-bg to-[#0d0d16] p-6 min-h-[340px]"
        >
          {/* Concentric ring backdrop */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.18]">
            <div className={cn("relative", positive ? "text-ninja-green" : "text-ninja-red")}>
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full border"
                  style={{
                    width: `${(i + 1) * 56}px`, height: `${(i + 1) * 56}px`,
                    borderColor: "currentColor",
                    left: `${-(i + 1) * 28}px`, top: `${-(i + 1) * 28}px`,
                  }}
                />
              ))}
              {positive ? <TrendingUp size={48} /> : <TrendingDown size={48} />}
            </div>
          </div>

          {/* Brand */}
          <div className="relative flex items-center gap-2 mb-6">
            <span className="text-2xl">🥷</span>
            <span className="font-bold text-lg text-ninja-text">CryptoNinja</span>
          </div>

          {/* Asset + direction */}
          <div className="relative flex items-center gap-2.5 mb-3">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold"
              style={{ backgroundColor: `${cfg?.color}22`, color: cfg?.color }}
            >
              {cfg?.icon || position.asset[0]}
            </span>
            <span className="font-bold text-2xl text-ninja-text">{position.asset}</span>
            <span className={cn(
              "px-2.5 py-1 rounded-lg text-sm font-bold",
              isLong ? "bg-ninja-green/20 text-ninja-green" : "bg-ninja-red/20 text-ninja-red"
            )}>
              {position.direction.toUpperCase()} {position.leverage}X
            </span>
          </div>

          {/* PnL % */}
          <div className={cn("relative font-bold leading-none mb-6", positive ? "text-ninja-green" : "text-ninja-red")}
               style={{ fontSize: "72px" }}>
            {positive ? "+" : ""}{pnl.toFixed(1)}%
          </div>

          {/* Entry / Mark */}
          <div className="relative flex gap-10">
            <div>
              <div className="text-ninja-muted text-xs mb-1">Entry Price</div>
              <div className="font-mono font-bold text-ninja-text">
                ${position.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: position.entryPrice < 1 ? 5 : 2 })}
              </div>
            </div>
            <div>
              <div className="text-ninja-muted text-xs mb-1">Mark Price</div>
              <div className="font-mono font-bold text-ninja-text">
                ${position.markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: position.markPrice < 1 ? 5 : 2 })}
              </div>
            </div>
          </div>

          <div className="relative text-ninja-muted/60 text-xs mt-5">{appUrl.replace(/^https?:\/\//, "")}</div>
        </div>

        {/* ── Controls ── */}
        <div className="lg:w-64 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-ninja-text">Share your trade</span>
            <button onClick={onClose} className="text-ninja-muted hover:text-ninja-text p-1 rounded">
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="text-xs text-ninja-muted mb-1 block">Customize your text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full bg-ninja-bg/60 border border-ninja-border rounded-lg px-3 py-2 text-xs text-ninja-text outline-none focus:border-ninja-accent resize-none"
            />
          </div>

          <div className="mt-auto space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={saveImage}
                disabled={saving}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-ninja-border/40 hover:bg-ninja-border/70 text-ninja-text text-xs font-bold transition-colors disabled:opacity-50"
              >
                <Download size={13} /> {saving ? "Saving…" : "Save Image"}
              </button>
              <button
                onClick={copyLink}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-ninja-border/40 hover:bg-ninja-border/70 text-ninja-text text-xs font-bold transition-colors"
              >
                <LinkIcon size={13} /> {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
            <button
              onClick={shareX}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-ninja-accent hover:bg-ninja-accent-hover text-white text-xs font-bold transition-colors"
            >
              𝕏  Share on X
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
