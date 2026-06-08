"use client";

import { useStore } from "@/store/useStore";
import { ASSETS, ASSET_LIST } from "@/types";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { NotificationsBell } from "./NotificationsBell";
import { MobileNav } from "./MobileNav";

export function TopBar() {
  const { marketData, selectedAsset, setSelectedAsset } = useStore();
  const { totalBalance } = useHyperliquid();
  const equity = totalBalance > 0 ? totalBalance : null;

  return (
    <header className="bg-ninja-card border-b border-ninja-border px-2 sm:px-4 py-2 flex items-center gap-2 sm:gap-4">
      <MobileNav />
      {/* Scrolling ticker tape — every market */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
        {ASSET_LIST.map((asset) => {
          const data = marketData[asset];
          const isSelected = selectedAsset === asset;
          const up = (data?.changePercent24h ?? 0) >= 0;
          const price = data?.price ?? 0;
          return (
            <button
              key={asset}
              onClick={() => setSelectedAsset(asset)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0",
                isSelected
                  ? "bg-ninja-accent/20 border border-ninja-accent/40"
                  : "border border-transparent hover:bg-ninja-border/50"
              )}
            >
              <span className="text-xs font-bold" style={{ color: ASSETS[asset]?.color }}>
                {asset}
              </span>
              <span className="text-ninja-text text-xs font-mono">
                {price > 0
                  ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2 })}`
                  : "—"}
              </span>
              <span className={cn("text-xs font-mono", up ? "text-ninja-green" : "text-ninja-red")}>
                {up ? "+" : ""}{data?.changePercent24h?.toFixed(2) ?? "0.00"}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Live-only platform */}
      <div className="flex items-center gap-1 bg-ninja-border/30 rounded-lg p-1 flex-shrink-0">
        <span className="px-3 py-1 rounded text-xs font-bold bg-green-500/30 text-green-400">LIVE</span>
      </div>

      {/* HL account equity (live mode only) */}
      {equity !== null && (
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          <Bot size={12} className="text-ninja-accent" />
          <span className="text-ninja-muted hidden md:inline">Equity</span>
          <span className="font-mono font-bold text-ninja-green">
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <NotificationsBell />
    </header>
  );
}
