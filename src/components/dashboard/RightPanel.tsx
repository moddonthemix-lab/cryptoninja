"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AutoTrader } from "./AutoTrader";
import { AIBrain } from "./AIBrain";
import { TradingPanel } from "@/components/trading/TradingPanel";
import { StrategyRunner } from "@/components/strategy/StrategyRunner";
import { HyperliquidAccount } from "@/components/wallet/HyperliquidAccount";

type Tab = "BOT" | "AI" | "TRADE" | "STRAT";

const TABS: { id: Tab; label: string }[] = [
  { id: "BOT", label: "BOT" },
  { id: "AI", label: "AI" },
  { id: "TRADE", label: "TRADE" },
  { id: "STRAT", label: "STRAT" },
];

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("BOT");

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-lg flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-2 border-b border-ninja-border/60">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-2 py-1.5 rounded text-xs font-bold transition-all",
              activeTab === tab.id
                ? "bg-ninja-accent/15 text-ninja-accent border-b-2 border-ninja-accent"
                : "text-ninja-muted hover:text-ninja-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="p-2 overflow-y-auto space-y-3">
        {activeTab === "BOT" && (
          <>
            <HyperliquidAccount />
            <AutoTrader />
          </>
        )}
        {activeTab === "AI" && <AIBrain />}
        {activeTab === "TRADE" && <TradingPanel />}
        {activeTab === "STRAT" && <StrategyRunner />}
      </div>
    </div>
  );
}
