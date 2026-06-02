"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { useStore } from "@/store/useStore";
import {
  buildOrderAction,
  buildCancelAction,
  buildSetLeverageAction,
  sendExchangeAction,
  HL_DOMAIN,
  floatToWire,
  getUserState,
  getOpenOrders,
} from "@/lib/hyperliquid";
import type { Asset } from "@/types";

export interface PlaceOrderParams {
  asset: Asset;
  isBuy: boolean;
  price: number;
  size: number;
  reduceOnly?: boolean;
  tif?: "Gtc" | "Ioc" | "Alo";
  isMarket?: boolean;
}

export function useHyperliquid() {
  const { address, isConnected } = useAccount();
  const { tradingMode } = useStore();
  const { signTypedDataAsync } = useSignTypedData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch asset index from meta
  const getAssetIndex = useCallback(async (asset: Asset): Promise<number> => {
    const res = await fetch("/api/hl/meta");
    const meta = await res.json();
    const info = meta[asset];
    if (!info) throw new Error(`Asset ${asset} not found on Hyperliquid`);
    return info.index;
  }, []);

  const placeOrder = useCallback(
    async (params: PlaceOrderParams): Promise<{ status: string; oid?: number }> => {
      if (!isConnected || !address) throw new Error("Wallet not connected");
      if (tradingMode !== "live") {
        throw new Error("Switch to Live mode to place real orders");
      }

      setLoading(true);
      setError(null);

      try {
        const assetIndex = await getAssetIndex(params.asset);
        const nonce = Date.now();

        // Build the action
        const action = buildOrderAction(
          assetIndex,
          params.isBuy,
          params.price,
          params.size,
          params.reduceOnly ?? false,
          params.tif ?? "Gtc"
        );

        // EIP-712 typed data for Hyperliquid
        const typedData = {
          domain: HL_DOMAIN,
          types: {
            Agent: [
              { name: "source", type: "string" },
              { name: "connectionId", type: "bytes32" },
            ],
          },
          primaryType: "Agent" as const,
          message: {
            source: "a",
            connectionId: `0x${nonce.toString(16).padStart(64, "0")}` as `0x${string}`,
          },
        };

        const sig = await signTypedDataAsync(typedData);

        // Parse signature
        const sigHex = sig.slice(2);
        const r = "0x" + sigHex.slice(0, 64);
        const s = "0x" + sigHex.slice(64, 128);
        const v = parseInt(sigHex.slice(128, 130), 16);

        const result = await sendExchangeAction(action, nonce, { r, s, v });

        if (result.status !== "ok") {
          throw new Error(JSON.stringify(result));
        }

        return result;
      } catch (e: any) {
        const msg = e.message || "Order failed";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, address, tradingMode, getAssetIndex, signTypedDataAsync]
  );

  const cancelOrder = useCallback(
    async (asset: Asset, orderId: number) => {
      if (!isConnected || !address) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);
      try {
        const assetIndex = await getAssetIndex(asset);
        const nonce = Date.now();
        const action = buildCancelAction(assetIndex, orderId);

        const typedData = {
          domain: HL_DOMAIN,
          types: {
            Agent: [
              { name: "source", type: "string" },
              { name: "connectionId", type: "bytes32" },
            ],
          },
          primaryType: "Agent" as const,
          message: {
            source: "a",
            connectionId: `0x${nonce.toString(16).padStart(64, "0")}` as `0x${string}`,
          },
        };

        const sig = await signTypedDataAsync(typedData);
        const sigHex = sig.slice(2);
        const r = "0x" + sigHex.slice(0, 64);
        const s = "0x" + sigHex.slice(64, 128);
        const v = parseInt(sigHex.slice(128, 130), 16);

        return sendExchangeAction(action, nonce, { r, s, v });
      } finally {
        setLoading(false);
      }
    },
    [isConnected, address, getAssetIndex, signTypedDataAsync]
  );

  const setLeverage = useCallback(
    async (asset: Asset, leverage: number, isCross = true) => {
      if (!isConnected || !address) throw new Error("Wallet not connected");

      setLoading(true);
      setError(null);
      try {
        const assetIndex = await getAssetIndex(asset);
        const nonce = Date.now();
        const action = buildSetLeverageAction(assetIndex, leverage, isCross);

        const typedData = {
          domain: HL_DOMAIN,
          types: {
            Agent: [
              { name: "source", type: "string" },
              { name: "connectionId", type: "bytes32" },
            ],
          },
          primaryType: "Agent" as const,
          message: {
            source: "a",
            connectionId: `0x${nonce.toString(16).padStart(64, "0")}` as `0x${string}`,
          },
        };

        const sig = await signTypedDataAsync(typedData);
        const sigHex = sig.slice(2);
        const r = "0x" + sigHex.slice(0, 64);
        const s = "0x" + sigHex.slice(64, 128);
        const v = parseInt(sigHex.slice(128, 130), 16);

        return sendExchangeAction(action, nonce, { r, s, v });
      } finally {
        setLoading(false);
      }
    },
    [isConnected, address, getAssetIndex, signTypedDataAsync]
  );

  const fetchAccount = useCallback(async () => {
    if (!address) return null;
    const res = await fetch(`/api/hl/account?address=${address}`);
    if (!res.ok) return null;
    return res.json();
  }, [address]);

  return {
    placeOrder,
    cancelOrder,
    setLeverage,
    fetchAccount,
    loading,
    error,
    isLive: tradingMode === "live",
  };
}
