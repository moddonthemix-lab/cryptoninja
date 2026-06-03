"use client";

import { useStore } from "@/store/useStore";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import { useHyperliquid } from "@/hooks/useHyperliquid";

const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function TopBar() {
  const { marketData, tradingMode, setTradingMode, selectedAsset, setSelectedAsset } = useStore();
  const { account } = useHyperliquid();
  const equity = account ? parseFloat(account.accountValue) : null;

  return (
    <header className="bg-ninja-card border-b border-ninja-border px-4 py-2 flex items-center gap-4 overflow-x-auto">
      {/* Asset prices */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {assets.map((asset) => {
          const data = marketData[asset];
          const isSelected = selectedAsset === asset;
          const up = (data?.changePercent24h ?? 0) >= 0;
          return (
            <button
              key={asset}
              onClick={() => setSelectedAsset(asset)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap",
                isSelected
                  ? "bg-ninja-accent/20 border border-ninja-accent/40"
                  : "hover:bg-ninja-border/50"
              )}
            >
              <span className="text-xs font-bold" style={{ color: ASSETS[asset].color }}>
                {asset}
              </span>
              <span className="text-ninja-text text-xs font-mono">
                ${data?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) ?? "—"}
              </span>
              <span className={cn("text-xs", up ? "text-ninja-green" : "text-ninja-red")}>
                {up ? "+" : ""}{data?.changePercent24h?.toFixed(2) ?? "0.00"}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Trading mode toggle */}
      <div className="flex items-center gap-1 bg-ninja-border/30 rounded-lg p-1 flex-shrink-0">
        <button
          onClick={() => setTradingMode("paper")}
          className={cn(
            "px-3 py-1 rounded text-xs font-bold transition-all",
            tradingMode === "paper"
              ? "bg-yellow-500/30 text-yellow-400"
              : "text-ninja-muted hover:text-ninja-text"
          )}
        >
          PAPER
        </button>
        <button
          onClick={() => setTradingMode("live")}
          className={cn(
            "px-3 py-1 rounded text-xs font-bold transition-all",
            tradingMode === "live"
              ? "bg-green-500/30 text-green-400"
              : "text-ninja-muted hover:text-ninja-text"
          )}
        >
          LIVE
        </button>
      </div>

      {/* HL account equity (live mode only) */}
      {tradingMode === "live" && equity !== null && (
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          <Bot size={12} className="text-ninja-accent" />
          <span className="text-ninja-muted hidden md:inline">Equity</span>
          <span className="font-mono font-bold text-ninja-green">
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </header>
  );
}
