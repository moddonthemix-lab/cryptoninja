import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "CryptoNinja",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [base, baseSepolia],
  ssr: true,
});

export const SUPPORTED_CHAINS = [base, baseSepolia];
export const DEFAULT_CHAIN = base;
