"use client";

import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { WalletConnect } from "./WalletConnect";
import { Lock } from "lucide-react";

interface WalletGateProps {
  children: React.ReactNode;
  action?: string; // e.g. "save strategies", "execute trades"
}

export function WalletGate({ children, action = "perform this action" }: WalletGateProps) {
  const { isConnected } = useAccount();
  const { isAuthenticated } = useStore();

  if (isConnected && isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="bg-ninja-card border border-ninja-accent/30 rounded-xl p-6 text-center space-y-4">
      <div className="w-10 h-10 rounded-full bg-ninja-accent/10 flex items-center justify-center mx-auto">
        <Lock size={18} className="text-ninja-accent" />
      </div>
      <div>
        <p className="text-ninja-text font-semibold text-sm mb-1">Wallet required</p>
        <p className="text-ninja-muted text-xs">
          Connect and sign in with your wallet to {action}
        </p>
      </div>
      <div className="flex justify-center">
        <WalletConnect />
      </div>
    </div>
  );
}
