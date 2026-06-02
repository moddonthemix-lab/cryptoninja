"use client";

import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";
import { LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function TopBar() {
  const { marketData, tradingMode, setTradingMode, selectedAsset, setSelectedAsset } = useStore();
  const { signOut, address } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
              <span
                className="text-xs font-bold"
                style={{ color: ASSETS[asset].color }}
              >
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

      {/* User */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-ninja-muted text-xs hidden md:block">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={async () => {
            setSigningOut(true);
            await signOut();
          }}
          disabled={signingOut}
          className="text-ninja-muted hover:text-ninja-red transition-colors p-1"
          title="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
