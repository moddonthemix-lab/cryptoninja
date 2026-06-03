import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrum, base, baseSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "CryptoNinja",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [arbitrum, base, baseSepolia],
  ssr: true,
});

// Arbitrum is primary — Hyperliquid EIP-712 uses chainId 42161
export const SUPPORTED_CHAINS = [arbitrum, base, baseSepolia];
export const DEFAULT_CHAIN = arbitrum;
