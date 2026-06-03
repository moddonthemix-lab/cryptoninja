"use client";

import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";
import { LogOut, Wallet, Unplug } from "lucide-react";
import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { WalletConnect } from "@/components/wallet/WalletConnect";

const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];

export function TopBar() {
  const { marketData, tradingMode, setTradingMode, selectedAsset, setSelectedAsset } = useStore();
  const { signOut, address, isAuthenticated } = useAuth();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
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

      {/* Auth state */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isConnected ? (
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <div className="flex items-center gap-1.5 text-ninja-muted text-xs hidden md:flex">
                <div className="w-1.5 h-1.5 rounded-full bg-ninja-green animate-pulse" />
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
            )}
            {isAuthenticated && (
              <button
                onClick={async () => { setSigningOut(true); await signOut(); }}
                disabled={signingOut}
                className="text-ninja-muted hover:text-ninja-yellow transition-colors p-1.5 rounded hover:bg-ninja-border/40"
                title="Sign out (keeps wallet connected)"
              >
                <LogOut size={13} />
              </button>
            )}
            <button
              onClick={() => { signOut(); disconnect(); }}
              className="flex items-center gap-1.5 text-ninja-muted hover:text-ninja-red transition-colors px-2 py-1.5 rounded hover:bg-red-500/10 text-xs border border-ninja-border hover:border-red-500/40"
              title="Disconnect wallet"
            >
              <Unplug size={12} />
              <span className="hidden md:inline">Disconnect</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-ninja-muted text-xs hidden md:block">
              <Wallet size={12} className="inline mr-1" />
              View only
            </span>
            <WalletConnect />
          </div>
        )}
      </div>
    </header>
  );
}
