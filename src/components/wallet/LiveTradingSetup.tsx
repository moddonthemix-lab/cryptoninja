"use client";

import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn } from "@/lib/utils";
import {
  CheckCircle, XCircle, ExternalLink, Loader2, Zap, Key,
} from "lucide-react";
import { useState, useEffect } from "react";

export function LiveTradingSetup() {
  const { tradingMode, setTradingMode } = useStore();
  const { account } = useHyperliquid();

  const [agentConfigured, setAgentConfigured] = useState<boolean | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  const hlEquity = account ? parseFloat(account.accountValue) : null;
  const hlFunded = hlEquity !== null && hlEquity >= 1;
  const isLive = tradingMode === "live";

  useEffect(() => {
    fetch("/api/hl/agent-status")
      .then((r) => r.json())
      .then((d) => { setAgentConfigured(d.configured); setAgentAddress(d.agentAddress); })
      .catch(() => setAgentConfigured(false));
  }, []);

  const steps = [
    {
      id: "agent",
      label: "API wallet key set",
      done: agentConfigured === true,
      detail: agentConfigured === true
        ? `Agent ${agentAddress?.slice(0, 10)}...${agentAddress?.slice(-4)} active — all orders sign automatically`
        : agentConfigured === false
          ? "Add HL_AGENT_PRIVATE_KEY to Railway environment variables"
          : "Checking...",
      action: agentConfigured === false ? (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
        >
          <ExternalLink size={11} />
          HL App
        </a>
      ) : null,
    },
    {
      id: "deposit",
      label: "Hyperliquid account funded",
      done: hlFunded,
      detail: hlFunded
        ? `$${hlEquity?.toFixed(2)} equity — ready to trade`
        : "Deposit USDC on Hyperliquid (minimum ~$10)",
      action: !hlFunded ? (
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs bg-ninja-accent/20 hover:bg-ninja-accent/30 text-ninja-accent px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
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
      detail: isLive ? "Live mode active" : "Toggle LIVE in the top bar or click here",
      action: !isLive ? (
        <button
          onClick={() => setTradingMode("live")}
          className="flex items-center gap-1.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
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

      <div className="w-full h-1.5 bg-ninja-border rounded-full overflow-hidden">
        <div
          className="h-full bg-ninja-accent rounded-full transition-all duration-500"
          style={{ width: `${(completedSteps / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-3 p-2.5 rounded-lg border transition-colors",
              step.done ? "bg-green-500/5 border-green-500/20" : "bg-ninja-bg/50 border-ninja-border/50"
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
            </div>
            {step.action && <div className="flex-shrink-0 mt-0.5">{step.action}</div>}
          </div>
        ))}
      </div>

      {/* Agent key setup instructions */}
      {agentConfigured === false && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
          <div className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
            <Key size={11} />
            How to add your API wallet key
          </div>
          <ol className="text-xs text-ninja-muted/80 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>On Hyperliquid → <strong className="text-ninja-text">More → API Wallets</strong></li>
            <li>Find <strong className="text-ninja-text">CRYPTONINJA1</strong> → export private key</li>
            <li>In Railway → your service → <strong className="text-ninja-text">Variables</strong>, add:
              <code className="text-ninja-accent bg-ninja-bg/80 px-1.5 py-0.5 rounded text-xs block mt-1 break-all">
                HL_AGENT_PRIVATE_KEY = 0x...your_key...
              </code>
              <code className="text-ninja-accent bg-ninja-bg/80 px-1.5 py-0.5 rounded text-xs block mt-1 break-all">
                HL_MASTER_ADDRESS = 0x...your_main_wallet...
              </code>
            </li>
            <li>Redeploy — no wallet connection needed ever again</li>
          </ol>
        </div>
      )}

      {allDone && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-300 leading-relaxed">
          <div className="font-bold mb-1">Fully live — no wallet connection needed</div>
          Auto Trader signs and submits all orders automatically using your API wallet.
          Enable the bot in the panel below to start trading.
        </div>
      )}

      <div className="text-ninja-muted/60 text-xs pt-1 border-t border-ninja-border/40 space-y-0.5">
        <div>• API wallet signs trades — it cannot withdraw funds</div>
        <div>• Your main wallet retains full custody</div>
        <div>• Revoke anytime on Hyperliquid → API Wallets</div>
      </div>
    </div>
  );
}
