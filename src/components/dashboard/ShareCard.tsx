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
  pnlPct: number; // ROE %
}

type BgVariant = "rings" | "aurora" | "rays" | "grid" | "mesh" | "minimal";
const BG_VARIANTS: { id: BgVariant; label: string }[] = [
  { id: "rings", label: "Rings" },
  { id: "aurora", label: "Aurora" },
  { id: "rays", label: "Rays" },
  { id: "grid", label: "Grid" },
  { id: "mesh", label: "Mesh" },
  { id: "minimal", label: "Minimal" },
];

// Character roster. `art` (optional) points to an anime/Ghibli PNG in
// /public/characters/*.png — if present it's used instead of the emoji, so you
// can swap in real artwork later with zero code changes.
interface CharOption { id: string; label: string; emoji: string; art?: string; }
const CHARACTERS: CharOption[] = [
  { id: "none", label: "None", emoji: "" },
  { id: "ninja-cat", label: "Ninja Cat", emoji: "🐱", art: "/characters/cat.png" },
  { id: "penguin", label: "Penguin", emoji: "🐧", art: "/characters/penguin.png" },
  { id: "dog", label: "Shiba", emoji: "🐶", art: "/characters/dog.png" },
  { id: "bird", label: "Falcon", emoji: "🦅", art: "/characters/bird.png" },
  { id: "horse", label: "Stallion", emoji: "🐴", art: "/characters/horse.png" },
  { id: "fox", label: "Fox", emoji: "🦊", art: "/characters/fox.png" },
  { id: "wolf", label: "Wolf", emoji: "🐺", art: "/characters/wolf.png" },
  { id: "frog", label: "Frog", emoji: "🐸", art: "/characters/frog.png" },
  { id: "bear", label: "Bear", emoji: "🐻", art: "/characters/bear.png" },
  { id: "bull", label: "Bull", emoji: "🐂", art: "/characters/bull.png" },
  { id: "dragon", label: "Dragon", emoji: "🐲", art: "/characters/dragon.png" },
];

// Renders the chosen character on the card. Uses artwork if available (and it
// loads), otherwise a large glowing emoji mascot.
function Character({ char, accent }: { char: CharOption; accent: string }) {
  const [artFailed, setArtFailed] = useState(false);
  if (char.id === "none") return null;
  const showArt = char.art && !artFailed;
  return (
    <div className="absolute right-0 bottom-0 top-0 w-[46%] flex items-end justify-center pointer-events-none overflow-hidden">
      {/* glow behind the character */}
      <div className="absolute rounded-full" style={{ width: 220, height: 220, bottom: 30, background: accent, opacity: 0.18, filter: "blur(50px)" }} />
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={char.art} alt={char.label} onError={() => setArtFailed(true)}
          className="relative max-h-[95%] object-contain drop-shadow-2xl" />
      ) : (
        <span className="relative leading-none" style={{ fontSize: 150, filter: `drop-shadow(0 6px 18px ${accent}66)` }}>
          {char.emoji}
        </span>
      )}
    </div>
  );
}

// Renders a creative backdrop for the given variant + accent color
function Background({ variant, color, positive }: { variant: BgVariant; color: string; positive: boolean }) {
  if (variant === "minimal") {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(120% 90% at 80% 0%, ${color}1f 0%, transparent 55%)` }}
      />
    );
  }

  if (variant === "aurora") {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ width: 320, height: 320, top: -80, right: -60, background: color, opacity: 0.28, filter: "blur(70px)" }} />
        <div className="absolute rounded-full" style={{ width: 260, height: 260, bottom: -90, left: -40, background: "#7c3aed", opacity: 0.25, filter: "blur(80px)" }} />
        <div className="absolute rounded-full" style={{ width: 180, height: 180, top: "40%", left: "55%", background: color, opacity: 0.18, filter: "blur(60px)" }} />
      </div>
    );
  }

  if (variant === "rays") {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-[0.22]">
        <div className="relative" style={{ width: 0, height: 0, color }}>
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="absolute origin-bottom"
              style={{
                width: 2, height: 460, left: 0, bottom: 0,
                background: `linear-gradient(to top, ${color}, transparent)`,
                transform: `rotate(${i * 15}deg)`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(${color}22 1px, transparent 1px), linear-gradient(90deg, ${color}22 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(120% 80% at 70% 20%, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(120% 80% at 70% 20%, #000 30%, transparent 75%)",
          }}
        />
        <div className="absolute inset-0" style={{ background: `radial-gradient(100% 70% at 80% 10%, ${color}22 0%, transparent 60%)` }} />
      </div>
    );
  }

  if (variant === "mesh") {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute rounded-full" style={{ width: 240, height: 240, top: -40, left: -40, background: color, opacity: 0.22, filter: "blur(60px)" }} />
        <div className="absolute rounded-full" style={{ width: 220, height: 220, top: 30, right: -60, background: "#06b6d4", opacity: 0.18, filter: "blur(60px)" }} />
        <div className="absolute rounded-full" style={{ width: 260, height: 260, bottom: -100, left: "30%", background: "#7c3aed", opacity: 0.22, filter: "blur(70px)" }} />
      </div>
    );
  }

  // rings (default)
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.18]">
      <div className="relative" style={{ color }}>
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
  );
}

export function ShareCard({ position, onClose }: { position: SharePosition; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bg, setBg] = useState<BgVariant>("aurora");
  const [charId, setCharId] = useState<string>("ninja-cat");

  const cfg = ASSETS[position.asset];
  const isLong = position.direction === "long";
  const pnl = position.pnlPct;
  const positive = pnl >= 0;
  const accent = positive ? "#10b981" : "#ef4444";
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
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, "_blank");
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
          <Background variant={bg} color={accent} positive={positive} />
          <Character char={CHARACTERS.find((c) => c.id === charId) ?? CHARACTERS[0]} accent={accent} />

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
        </div>

        {/* ── Controls ── */}
        <div className="lg:w-64 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-ninja-text">Share your trade</span>
            <button onClick={onClose} className="text-ninja-muted hover:text-ninja-text p-1 rounded">
              <X size={16} />
            </button>
          </div>

          {/* Character picker */}
          <div>
            <label className="text-xs text-ninja-muted mb-1.5 block">Character</label>
            <div className="grid grid-cols-6 gap-1.5">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCharId(c.id)}
                  title={c.label}
                  className={cn(
                    "h-9 rounded-lg border flex items-center justify-center text-lg transition-all",
                    charId === c.id ? "border-ninja-accent ring-1 ring-ninja-accent bg-ninja-accent/10" : "border-ninja-border hover:border-ninja-accent/50"
                  )}
                >
                  {c.id === "none" ? <span className="text-[9px] text-ninja-muted">off</span> : c.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Background picker */}
          <div>
            <label className="text-xs text-ninja-muted mb-1.5 block">Background</label>
            <div className="grid grid-cols-3 gap-1.5">
              {BG_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setBg(v.id)}
                  className={cn(
                    "relative h-12 rounded-lg overflow-hidden border transition-all",
                    bg === v.id ? "border-ninja-accent ring-1 ring-ninja-accent" : "border-ninja-border hover:border-ninja-accent/50"
                  )}
                  title={v.label}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-ninja-bg to-[#0d0d16]">
                    <Background variant={v.id} color={accent} positive={positive} />
                  </div>
                  <span className="absolute bottom-0.5 left-1 text-[9px] text-ninja-text/80 font-bold z-10">{v.label}</span>
                </button>
              ))}
            </div>
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
