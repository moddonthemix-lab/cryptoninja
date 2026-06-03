"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTypedData, useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import {
  buildOrderAction, buildSetLeverageAction, buildCancelAction, HL_COINS,
} from "@/lib/hyperliquid";
import {
  HL_L1_DOMAIN, HL_AGENT_TYPES, computeConnectionId, buildPhantomAgent, splitSignature,
} from "@/lib/hl-signing";
import type { Asset } from "@/types";

export interface HLAccountSummary {
  accountValue: string;
  totalNtlPos: string;
  totalMarginUsed: string;
  withdrawable: string;
}

export interface HLLivePosition {
  coin: string;
  szi: string;       // negative = short
  entryPx: string;
  unrealizedPnl: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
}

interface AssetMeta {
  index: number;
  name: string;
  maxLeverage: number;
  szDecimals: number;
}

export function useHyperliquid() {
  const { address, isConnected } = useAccount();
  const { tradingMode } = useStore();
  const { signTypedDataAsync } = useSignTypedData();

  const [account, setAccount] = useState<HLAccountSummary | null>(null);
  const [livePositions, setLivePositions] = useState<HLLivePosition[]>([]);
  const [assetMeta, setAssetMeta] = useState<Record<string, AssetMeta>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccount = useCallback(async () => {
    try {
      const accountUrl = address ? `/api/hl/account?address=${address}` : "/api/hl/account";
      const [accRes, metaRes] = await Promise.all([
        fetch(accountUrl),
        fetch("/api/hl/meta"),
      ]);
      const accData = await accRes.json();
      const meta = await metaRes.json();

      if (accData.state?.crossMarginSummary) {
        setAccount(accData.state.crossMarginSummary);
        setLivePositions(
          (accData.state.assetPositions as Array<{ position: HLLivePosition }>)
            .map((p) => p.position)
            .filter((p) => parseFloat(p.szi) !== 0)
        );
      }
      if (!meta.error) setAssetMeta(meta);
    } catch (e: any) {
      console.error("HL account fetch:", e.message);
    }
  }, [address]);

  // Fetch on mount and every 15s — works with or without wallet connected
  useEffect(() => {
    refreshAccount();
    const interval = setInterval(refreshAccount, 15_000);
    return () => clearInterval(interval);
  }, [refreshAccount]);

  // Core: sign any HL action and submit via our server proxy
  const submitAction = useCallback(async (action: object): Promise<any> => {
    if (!isConnected || !address) throw new Error("Wallet not connected");

    const nonce = Date.now();
    const connectionId = computeConnectionId(action, nonce);
    const sig = await signTypedDataAsync({
      domain: HL_L1_DOMAIN,
      types: HL_AGENT_TYPES,
      primaryType: "Agent",
      message: buildPhantomAgent(connectionId),
    });

    const signature = splitSignature(sig);
    const res = await fetch("/api/hl/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, nonce, signature }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Trade failed");
    return data;
  }, [isConnected, address, signTypedDataAsync]);

  // Set leverage (must be done before first order on a new asset)
  const setLeverage = useCallback(async (asset: Asset, leverage: number, isCross = true) => {
    const meta = assetMeta[HL_COINS[asset]];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    return submitAction(buildSetLeverageAction(meta.index, Math.min(leverage, meta.maxLeverage), isCross));
  }, [assetMeta, submitAction]);

  // Place a market order by size in USD
  const placeMarketOrder = useCallback(async ({
    asset, direction, sizeUsd, currentPrice,
  }: {
    asset: Asset;
    direction: "long" | "short";
    sizeUsd: number;
    currentPrice: number;
  }) => {
    if (tradingMode !== "live") throw new Error("Switch to Live mode for real orders");
    setLoading(true);
    setError(null);
    try {
      const meta = assetMeta[HL_COINS[asset]];
      if (!meta) throw new Error(`Meta not loaded for ${asset}`);

      const isBuy = direction === "long";
      // 1% slippage tolerance for market orders
      const limitPx = isBuy ? currentPrice * 1.01 : currentPrice * 0.99;
      const sz = parseFloat((sizeUsd / currentPrice).toFixed(meta.szDecimals));

      const action = buildOrderAction(meta.index, isBuy, limitPx, sz, false, "Ioc");
      const result = await submitAction(action);
      await refreshAccount();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [assetMeta, tradingMode, submitAction, refreshAccount]);

  // Close a position (reduce-only)
  const closeLivePosition = useCallback(async ({
    asset, direction, size, currentPrice,
  }: {
    asset: Asset;
    direction: "long" | "short";
    size: number;
    currentPrice: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const meta = assetMeta[HL_COINS[asset]];
      if (!meta) throw new Error(`Meta not loaded for ${asset}`);

      const isBuy = direction === "short"; // close short = buy back
      const limitPx = isBuy ? currentPrice * 1.01 : currentPrice * 0.99;
      const sz = parseFloat(size.toFixed(meta.szDecimals));

      const action = buildOrderAction(meta.index, isBuy, limitPx, sz, true, "Ioc"); // reduceOnly
      const result = await submitAction(action);
      await refreshAccount();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [assetMeta, submitAction, refreshAccount]);

  const cancelOrder = useCallback(async (asset: Asset, orderId: number) => {
    const meta = assetMeta[HL_COINS[asset]];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    return submitAction(buildCancelAction(meta.index, orderId));
  }, [assetMeta, submitAction]);

  // Legacy-compatible placeOrder for TradingPanel
  const placeOrder = useCallback(async (params: {
    asset: Asset;
    isBuy: boolean;
    price: number;
    size: number;
    reduceOnly?: boolean;
    tif?: "Gtc" | "Ioc" | "Alo";
  }) => {
    if (tradingMode !== "live") throw new Error("Switch to Live mode for real orders");
    setLoading(true);
    setError(null);
    try {
      const meta = assetMeta[HL_COINS[params.asset]];
      if (!meta) throw new Error(`Meta not loaded for ${params.asset}`);
      const action = buildOrderAction(
        meta.index, params.isBuy, params.price,
        parseFloat(params.size.toFixed(meta.szDecimals)),
        params.reduceOnly ?? false, params.tif ?? "Gtc"
      );
      const result = await submitAction(action);
      await refreshAccount();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [assetMeta, tradingMode, submitAction, refreshAccount]);

  return {
    account,
    livePositions,
    assetMeta,
    loading,
    error,
    isLive: tradingMode === "live",
    refreshAccount,
    setLeverage,
    placeOrder,
    placeMarketOrder,
    closeLivePosition,
    cancelOrder,
    submitAction,
  };
}
