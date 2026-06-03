"use client";

import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { arbitrum } from "wagmi/chains";
import { useAuth } from "@/hooks/useAuth";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { erc20Abi, formatUnits } from "viem";
import { cn } from "@/lib/utils";
import {
  CheckCircle, XCircle, ExternalLink, Loader2, ChevronRight,
  Wallet, Shield, Zap, Key,
} from "lucide-react";
import { useState, useEffect } from "react";

const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`;

export function LiveTradingSetup() {
  const { address, isConnected, chainId } = useAccount();
  const { isAuthenticated, signIn } = useAuth();
  const { tradingMode, setTradingMode } = useStore();
  const { account } = useHyperliquid();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [agentConfigured, setAgentConfigured] = useState<boolean | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  const isOnArbitrum = chainId === arbitrum.id;
  const hlEquity = account ? parseFloat(account.accountValue) : null;
  const hlFunded = hlEquity !== null && hlEquity >= 1;
  const isLive = tradingMode === "live";

  // Check if agent key is set server-side
  useEffect(() => {
    fetch("/api/hl/agent-status")
      .then((r) => r.json())
      .then((d) => {
        setAgentConfigured(d.configured);
        setAgentAddress(d.agentAddress);
      })
      .catch(() => setAgentConfigured(false));
  }, []);

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

  const steps = [
    {
      id: "connect",
      label: "Connect wallet",
      done: isConnected,
      detail: isConnected
        ? `${address?.slice(0, 6)}...${address?.slice(-4)}`
        : "Connect MetaMask, Coinbase Wallet, etc.",
      action: null,
    },
    {
      id: "siwe",
      label: "Sign in with Ethereum",
      done: isAuthenticated,
      detail: isAuthenticated
        ? "Session active"
        : "One-click signature — no gas, no transaction",
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
      id: "agent",
      label: "API wallet key set",
      done: agentConfigured === true,
      detail: agentConfigured === true
        ? `Agent ${agentAddress?.slice(0, 10)}... active — orders signed server-side`
        : agentConfigured === false
          ? "Add HL_AGENT_PRIVATE_KEY to Railway env vars"
          : "Checking...",
      action: agentConfigured === false ? (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors"
        >
          <ExternalLink size={11} />
          HL App
        </a>
      ) : null,
    },
    {
      id: "deposit",
      label: "Fund Hyperliquid account",
      done: hlFunded,
      detail: hlFunded
        ? `$${hlEquity?.toFixed(2)} equity on Hyperliquid`
        : usdcBalance !== null
          ? `$${usdcBalance.toFixed(2)} USDC on Arbitrum ready to deposit`
          : "Deposit USDC from Arbitrum",
      action: !hlFunded ? (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors"
        >
          <ExternalLink size={11} />
          Deposit
        </a>
      ) : null,
    },
    {
      id: "live",
      label: "Enable Live mode",
      done: isLive,
      detail: isLive
        ? "Live mode active — real orders sign automatically"
        : "Toggle LIVE in the top bar or click below",
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-ninja-accent" />
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
              "flex items-start gap-3 p-2.5 rounded-lg border transition-colors",
              step.done
                ? "bg-green-500/5 border-green-500/20"
                : "bg-ninja-bg/50 border-ninja-border/50"
            )}
          >
            {step.done
              ? <CheckCircle size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
              : <XCircle size={15} className="text-ninja-muted/50 flex-shrink-0 mt-0.5" />}
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

      {/* Agent key setup instructions (shown when not configured) */}
      {agentConfigured === false && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
          <div className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
            <Key size={11} />
            How to add your API wallet key
          </div>
          <ol className="text-xs text-ninja-muted/80 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>On Hyperliquid, go to <strong className="text-ninja-text">Account → API Wallets</strong></li>
            <li>Find <strong className="text-ninja-text">CRYPTONINJA1</strong> and export its private key</li>
            <li>In Railway dashboard, add environment variable:<br />
              <code className="text-ninja-accent bg-ninja-bg/80 px-1.5 py-0.5 rounded text-xs block mt-1">
                HL_AGENT_PRIVATE_KEY = 0x...your_private_key...
              </code>
            </li>
            <li>Redeploy — orders will sign automatically, no wallet popups</li>
          </ol>
        </div>
      )}

      {allDone && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-300 leading-relaxed">
          <div className="font-bold mb-1">Ready to trade live on Hyperliquid!</div>
          Enable Auto Trader in BOT tab or place orders in TRADE tab.
          Your API wallet signs all orders automatically — no popups.
        </div>
      )}

      <div className="text-ninja-muted/60 text-xs pt-1 border-t border-ninja-border/40 space-y-0.5">
        <div className="font-medium text-ninja-muted">Security</div>
        <div>• API wallet can only trade, not withdraw funds</div>
        <div>• Your main wallet retains full custody</div>
        <div>• Disable the API wallet on HL anytime to revoke access</div>
      </div>
    </div>
  );
}
