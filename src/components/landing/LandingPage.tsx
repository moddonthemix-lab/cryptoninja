"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

const features = [
  { icon: "🤖", title: "AI Brain", desc: "Claude AI analyzes BTC, ETH, HYPE & SOL using TheStrat FTFC methodology" },
  { icon: "⚡", title: "Auto Trader", desc: "API wallet signs and submits real orders automatically — no wallet popups" },
  { icon: "🛡️", title: "Risk First", desc: "Paper trading, emergency kill switch, and hard stop-loss enforcement" },
  { icon: "📊", title: "Live Charts", desc: "TradingView charts with entry, stop loss & take profit overlays" },
];

export function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-ninja-bg flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-ninja-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🥷</span>
          <span className="font-bold text-xl text-ninja-text">CryptoNinja</span>
          <span className="text-xs bg-ninja-accent/20 text-ninja-accent border border-ninja-accent/30 px-2 py-0.5 rounded-full ml-2">
            BETA
          </span>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-ninja-muted hover:text-ninja-text text-sm transition-colors"
        >
          Open Dashboard <ArrowRight size={14} />
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl"
        >
          <div className="text-6xl mb-6">🥷</div>
          <h1 className="text-4xl md:text-6xl font-bold text-ninja-text mb-4">
            Trade Like a{" "}
            <span className="text-ninja-accent">Ninja</span>
          </h1>
          <p className="text-xl text-ninja-muted mb-2">
            AI-powered leverage trading with automated strategies
          </p>
          <p className="text-sm text-ninja-muted mb-10">
            BTC · ETH · HYPE · SOL — Hyperliquid perps
          </p>

          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 bg-ninja-accent hover:bg-ninja-accent-hover text-white font-bold px-10 py-3 rounded-xl transition-all duration-200 ninja-glow text-base mx-auto"
          >
            Enter App
            <ArrowRight size={18} />
          </button>

          {/* Disclaimer */}
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-left max-w-xl mx-auto mt-8">
            <p className="text-red-400 text-xs font-bold mb-1">⚠️ RISK DISCLAIMER</p>
            <p className="text-red-300/70 text-xs">
              Leverage trading involves substantial risk of loss. Always start with paper trading.
              Never trade more than you can afford to lose. Past performance does not guarantee future results.
            </p>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 max-w-4xl w-full"
        >
          {features.map((f) => (
            <div key={f.title} className="bg-ninja-card border border-ninja-border rounded-xl p-4 text-left">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-semibold text-ninja-text text-sm mb-1">{f.title}</div>
              <div className="text-ninja-muted text-xs">{f.desc}</div>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
