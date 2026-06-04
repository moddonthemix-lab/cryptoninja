"use client";

import { useHyperliquid } from "@/hooks/useHyperliquid";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { ExternalLink, RefreshCw, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export function HyperliquidAccount() {
  const { isConnected } = useAccount();
  const { tradingMode } = useStore();
  const { account, livePositions, totalBalance, spotUsdcBalance, balanceInSpotOnly, withdrawable, loading, refreshAccount } = useHyperliquid();

  if (tradingMode !== "live") return null;

  const equity = totalBalance > 0 ? totalBalance : null;
  // withdrawable = top-level HL field; for spot-only accounts use spotUsdcBalance
  const available = balanceInSpotOnly ? spotUsdcBalance : (account ? withdrawable : null);
  const marginUsed = account ? parseFloat(account.totalMarginUsed) : null;

  // Total open (unrealized) PnL across all live positions
  const totalUnrealized = livePositions.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl || "0"), 0);
  const pnlPct = equity && equity > 0 ? (totalUnrealized / equity) * 100 : 0;
  const hasOpen = livePositions.length > 0;

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-ninja-accent" />
          <span className="text-sm font-bold text-ninja-text">Hyperliquid Account</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">LIVE</span>
        </div>
        <button
          onClick={refreshAccount}
          className="text-ninja-muted hover:text-ninja-text transition-colors p-1 rounded"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Balance row */}
      {equity !== null ? (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-ninja-bg/50 rounded-lg p-2">
            <div className="text-ninja-muted mb-0.5">Equity</div>
            <div className="font-mono font-bold text-ninja-green">
              ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-ninja-bg/50 rounded-lg p-2">
            <div className="text-ninja-muted mb-0.5">Available</div>
            <div className="font-mono font-bold text-ninja-text">
              ${(available ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-ninja-bg/50 rounded-lg p-2">
            <div className="text-ninja-muted mb-0.5">Margin Used</div>
            <div className="font-mono font-bold text-yellow-400">
              ${(marginUsed ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-ninja-muted text-center py-2">
          {loading ? "Loading..." : "No account data — make sure you have deposited USDC"}
        </div>
      )}

      {/* Live open PnL — clearly the LIVE account, not paper */}
      {equity !== null && (
        <div className={cn(
          "rounded-lg px-3 py-2.5 flex items-center justify-between border",
          hasOpen
            ? totalUnrealized >= 0 ? "bg-green-500/5 border-green-500/30" : "bg-red-500/5 border-red-500/30"
            : "bg-ninja-bg/40 border-ninja-border"
        )}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">LIVE</span>
            <span className="text-xs text-ninja-muted">Open PnL</span>
          </div>
          {hasOpen ? (
            <div className="text-right">
              <span className={cn("font-mono font-bold text-sm", totalUnrealized >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                {totalUnrealized >= 0 ? "+" : ""}${Math.abs(totalUnrealized).toFixed(2)}
              </span>
              <span className={cn("font-mono text-xs ml-1.5", pnlPct >= 0 ? "text-ninja-green/70" : "text-ninja-red/70")}>
                ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <span className="text-xs text-ninja-muted">No open positions</span>
          )}
        </div>
      )}

      {/* Spot balance note — user has USDC in spot, needs to move to perp */}
      {balanceInSpotOnly && equity !== null && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 leading-relaxed">
          Your USDC is in the <strong>spot wallet</strong>. For leveraged perp trading, transfer it to the <strong>Perp account</strong> on Hyperliquid. For unified margin accounts, spot funds trade automatically.
        </div>
      )}

      {/* Deposit prompt if equity is low */}
      {(equity === null || equity < 5) && (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-ninja-accent/10 border border-ninja-accent/30 hover:bg-ninja-accent/20 transition-colors text-xs text-ninja-accent font-medium"
        >
          <ExternalLink size={11} />
          Deposit USDC on Hyperliquid
        </a>
      )}

      {/* Live open positions */}
      {livePositions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-ninja-muted uppercase tracking-wide">Live Positions</div>
          {livePositions.map((pos) => {
            const sz = parseFloat(pos.szi);
            const isLong = sz > 0;
            const pnl = parseFloat(pos.unrealizedPnl);
            return (
              <div
                key={pos.coin}
                className={cn(
                  "flex items-center justify-between text-xs rounded-lg p-2 border",
                  pnl >= 0
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {isLong
                    ? <TrendingUp size={11} className="text-ninja-green" />
                    : <TrendingDown size={11} className="text-ninja-red" />}
                  <span className="font-bold">{pos.coin}</span>
                  <span className="text-ninja-muted">{isLong ? "LONG" : "SHORT"}</span>
                  <span className="text-ninja-muted">{pos.leverage.value}x</span>
                </div>
                <div className="text-right">
                  <div className={cn("font-mono font-bold", pnl >= 0 ? "text-ninja-green" : "text-ninja-red")}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </div>
                  <div className="text-ninja-muted">@ ${parseFloat(pos.entryPx).toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-ninja-muted/60 text-xs">
        Trades are signed by your wallet — no private keys are stored.
      </p>
    </div>
  );
}
