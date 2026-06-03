"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { Loader2, Shield, Zap } from "lucide-react";

export function WalletConnect() {
  const { isConnected, address } = useAccount();
  const { isAuthenticated, signIn } = useAuth();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsSigning(true);
    setError(null);
    try {
      await signIn();
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
          if (!mounted) return null;

          if (!account) {
            return (
              <button
                onClick={openConnectModal}
                className="flex items-center gap-2 bg-ninja-accent hover:bg-ninja-accent-hover text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 ninja-glow"
              >
                <Zap size={18} />
                Connect Wallet
              </button>
            );
          }

          if (chain?.unsupported) {
            return (
              <button
                onClick={openChainModal}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-all"
              >
                ⚠️ Wrong Network — Switch to Arbitrum
              </button>
            );
          }

          if (!isAuthenticated) {
            return (
              <div className="flex flex-col items-center gap-3">
                <div className="text-ninja-muted text-sm">
                  Connected: {account.displayName}
                </div>
                <button
                  onClick={handleSignIn}
                  disabled={isSigning}
                  className="flex items-center gap-2 bg-ninja-accent hover:bg-ninja-accent-hover disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200"
                >
                  {isSigning ? (
                    <><Loader2 size={18} className="animate-spin" /> Signing...</>
                  ) : (
                    <><Shield size={18} /> Sign In with Ethereum</>
                  )}
                </button>
                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}
              </div>
            );
          }

          return (
            <button
              onClick={openAccountModal}
              className="flex items-center gap-2 bg-ninja-card border border-ninja-border hover:border-ninja-accent text-ninja-text px-4 py-2 rounded-xl transition-all"
            >
              <div className="w-2 h-2 rounded-full bg-ninja-green animate-pulse" />
              {account.displayName}
            </button>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
}
