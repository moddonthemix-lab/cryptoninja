"use client";

import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { arbitrum } from "wagmi/chains";
import { useAuth } from "@/hooks/useAuth";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { erc20Abi, formatUnits } from "viem";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, ExternalLink, Loader2, ChevronRight, Wallet, Shield, ArrowDownToLine, Zap } from "lucide-react";
import { useState } from "react";

// USDC native on Arbitrum One
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`;

export function LiveTradingSetup() {
  const { address, isConnected, chainId } = useAccount();
  const { isAuthenticated, signIn } = useAuth();
  const { tradingMode, setTradingMode } = useStore();
  const { account } = useHyperliquid();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const isOnArbitrum = chainId === arbitrum.id;
  const hlEquity = account ? parseFloat(account.accountValue) : null;
  const hlFunded = hlEquity !== null && hlEquity >= 1;

  // USDC balance on Arbitrum
  const { data: usdcRaw } = useReadContract({
    address: USDC_ARBITRUM,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arbitrum.id,
    query: { enabled: !!address },
  });
  const usdcBalance = usdcRaw !== undefined ? parseFloat(formatUnits(usdcRaw, 6)) : null;

  const isLive = tradingMode === "live";

  // Steps
  const steps = [
    {
      id: "connect",
      label: "Connect wallet",
      done: isConnected,
      detail: isConnected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : "Use RainbowKit to connect MetaMask, Coinbase, etc.",
      action: null,
    },
    {
      id: "siwe",
      label: "Sign in with Ethereum",
      done: isAuthenticated,
      detail: isAuthenticated ? "Session active" : "One-click signature — no gas, no transaction",
      action: !isAuthenticated && isConnected ? (
        <button
          onClick={async () => {
            setIsSigning(true);
            setSignError(null);
            try { await signIn(); } catch (e: any) { setSignError(e.message); }
            finally { setIsSigning(false); }
          }}
          disabled={isSigning}
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSigning ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />}
          {isSigning ? "Signing..." : "Sign In"}
        </button>
      ) : null,
    },
    {
      id: "network",
      label: "Switch to Arbitrum",
      done: isOnArbitrum,
      detail: isOnArbitrum ? "Arbitrum One (chain 42161)" : "Deposits require Arbitrum; HL orders work on any chain",
      action: !isOnArbitrum && isConnected ? (
        <button
          onClick={() => switchChain({ chainId: arbitrum.id })}
          disabled={isSwitching}
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSwitching ? <Loader2 size={11} className="animate-spin" /> : <ChevronRight size={11} />}
          Switch
        </button>
      ) : null,
    },
    {
      id: "deposit",
      label: "Fund Hyperliquid account",
      done: hlFunded,
      detail: hlFunded
        ? `$${hlEquity?.toFixed(2)} equity on Hyperliquid`
        : usdcBalance !== null
          ? `You have $${usdcBalance.toFixed(2)} USDC on Arbitrum ready to deposit`
          : "Deposit USDC from Arbitrum to start trading",
      action: !hlFunded ? (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors"
        >
          <ExternalLink size={11} />
          Deposit on HL
        </a>
      ) : null,
    },
    {
      id: "live",
      label: "Enable Live trading mode",
      done: isLive,
      detail: isLive ? "Live mode active — real orders will be signed and submitted" : "Toggle LIVE in the top bar or below",
      action: !isLive ? (
        <button
          onClick={() => setTradingMode("live")}
          className="flex items-center gap-1.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2.5 py-1 rounded-lg transition-colors"
        >
          <Zap size={11} />
          Go Live
        </button>
      ) : null,
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;
  const allDone = completedSteps === steps.length;

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-ninja-accent" />
          <span className="text-sm font-bold text-ninja-text">Live Trading Setup</span>
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded-full",
          allDone ? "bg-green-500/20 text-green-400" : "bg-ninja-border text-ninja-muted"
        )}>
          {completedSteps}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-ninja-border rounded-full overflow-hidden">
        <div
          className="h-full bg-ninja-accent rounded-full transition-all duration-500"
          style={{ width: `${(completedSteps / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-3 p-2.5 rounded-lg transition-colors",
              step.done ? "bg-green-500/5 border border-green-500/20" : "bg-ninja-bg/50 border border-ninja-border/50"
            )}
          >
            {step.done ? (
              <CheckCircle size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={15} className="text-ninja-muted/50 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className={cn("text-xs font-bold", step.done ? "text-green-400" : "text-ninja-text")}>
                {step.label}
              </div>
              <div className="text-ninja-muted/70 text-xs mt-0.5 leading-relaxed">{step.detail}</div>
              {signError && step.id === "siwe" && (
                <div className="text-red-400 text-xs mt-1">{signError}</div>
              )}
            </div>
            {step.action && <div className="flex-shrink-0 mt-0.5">{step.action}</div>}
          </div>
        ))}
      </div>

      {/* All done */}
      {allDone && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-300 leading-relaxed">
          <div className="font-bold mb-1">Ready to trade live on Hyperliquid!</div>
          Enable the Auto Trader in BOT tab or place orders manually in the TRADE tab.
          Each order triggers a wallet signature — no private keys stored.
        </div>
      )}

      {/* How orders are signed */}
      <div className="text-ninja-muted/60 text-xs space-y-0.5 pt-1 border-t border-ninja-border/40">
        <div className="font-medium text-ninja-muted">How it works:</div>
        <div>• Orders are signed client-side via EIP-712 (your wallet)</div>
        <div>• Signed actions go to Hyperliquid's exchange API directly</div>
        <div>• No private keys are stored — only you can approve trades</div>
      </div>
    </div>
  );
}
