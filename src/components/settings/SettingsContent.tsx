"use client";

import { Settings as SettingsIcon, Zap } from "lucide-react";

export function SettingsContent() {
  return (
    <div className="space-y-4 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-2">
        <SettingsIcon size={20} className="text-ninja-accent" />
        <h1 className="text-lg font-bold text-ninja-text">Settings</h1>
      </div>

      <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 flex items-start gap-3">
        <Zap size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-bold text-sm text-ninja-text">Live trading only</div>
          <p className="text-ninja-muted text-xs mt-0.5 leading-relaxed">
            This is a live-only platform — every trade is real on Hyperliquid. There is no paper/simulation mode.
            Bot controls (AI analysis, Learning, leverage, watched ticker) are in the BOT panel on the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
