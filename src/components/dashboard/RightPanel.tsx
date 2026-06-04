"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AutoTrader } from "./AutoTrader";
import { TradingPanel } from "@/components/trading/TradingPanel";
import { HyperliquidAccount } from "@/components/wallet/HyperliquidAccount";
import { LiveTradingSetup } from "@/components/wallet/LiveTradingSetup";
import { useStore } from "@/store/useStore";

type Tab = "BOT" | "TRADE";

const TABS: { id: Tab; label: string }[] = [
  { id: "BOT", label: "BOT" },
  { id: "TRADE", label: "TRADE" },
];

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("BOT");
  const { tradingMode } = useStore();

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1.5 m-1.5 rounded-lg bg-ninja-bg/50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 px-2 py-1.5 rounded-md text-xs font-bold transition-all duration-200",
              activeTab === tab.id
                ? "bg-ninja-accent text-white shadow-lg shadow-ninja-accent/20"
                : "text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/40"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div key={activeTab} className="p-2 overflow-y-auto space-y-3 animate-fade-in">
        {activeTab === "BOT" && (
          <>
            {tradingMode === "live" ? (
              <>
                <LiveTradingSetup />
                <HyperliquidAccount />
              </>
            ) : null}
            <AutoTrader />
          </>
        )}
        {activeTab === "TRADE" && <TradingPanel />}
      </div>
    </div>
  );
}
