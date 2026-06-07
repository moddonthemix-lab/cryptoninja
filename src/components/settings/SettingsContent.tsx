"use client";

import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Settings as SettingsIcon, AlertTriangle } from "lucide-react";

export function SettingsContent() {
  const { paperEnabled, setPaperEnabled, tradingMode } = useStore();

  return (
    <div className="space-y-4 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-2">
        <SettingsIcon size={20} className="text-ninja-accent" />
        <h1 className="text-lg font-bold text-ninja-text">Settings</h1>
      </div>

      {/* Paper trading */}
      <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-sm text-ninja-text">Enable Paper Trading</div>
            <p className="text-ninja-muted text-xs mt-0.5 leading-relaxed">
              Off = the app is <b className="text-ninja-text">live-only</b>: the PAPER option is hidden and the bot,
              copy trading & manual trades can never open simulated positions. Turn on to get a PAPER mode for testing.
            </p>
          </div>
          <button
            onClick={() => setPaperEnabled(!paperEnabled)}
            className={cn("relative w-12 h-6 rounded-full transition-colors flex-shrink-0", paperEnabled ? "bg-yellow-500" : "bg-ninja-border")}
          >
            <span className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", paperEnabled ? "translate-x-[26px]" : "translate-x-0.5")} />
          </button>
        </div>

        <div className={cn("rounded-lg p-2.5 text-xs flex items-center gap-2",
          paperEnabled ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-300" : "bg-green-500/10 border border-green-500/30 text-green-300")}>
          {paperEnabled ? (
            <><AlertTriangle size={13} /> Paper mode available · currently trading: <b>{tradingMode.toUpperCase()}</b></>
          ) : (
            <><AlertTriangle size={13} /> Live-only — paper hidden. All trades are real on Hyperliquid.</>
          )}
        </div>
      </div>

      <p className="text-ninja-muted/60 text-[11px]">
        Bot-specific switches (AI analysis, Learning, leverage) live in the BOT panel on the dashboard.
      </p>
    </div>
  );
}
