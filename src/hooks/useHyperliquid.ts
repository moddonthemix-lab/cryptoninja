"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import {
  buildOrderAction, buildSetLeverageAction, buildCancelAction, buildPositionTpSlAction,
} from "@/lib/hyperliquid";
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
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  dex: "" | "xyz";
  hlCoin: string;
}

export function useHyperliquid() {
  const { address } = useAccount();
  const { tradingMode } = useStore();
  const [account, setAccount] = useState<HLAccountSummary | null>(null);
  const [livePositions, setLivePositions] = useState<HLLivePosition[]>([]);
  const [assetMeta, setAssetMeta] = useState<Record<string, AssetMeta>>({});
  const [spotUsdcBalance, setSpotUsdcBalance] = useState<number>(0);
  const [withdrawable, setWithdrawable] = useState<number>(0);
  // Per-coin TP/SL trigger prices parsed from open trigger orders
  const [triggers, setTriggers] = useState<Record<string, { tp?: number; sl?: number }>>({});
  // Full list of resting open orders (limit + trigger)
  const [openOrders, setOpenOrders] = useState<any[]>([]);
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
        // withdrawable is top-level in the HL response, not inside crossMarginSummary
        setWithdrawable(parseFloat(accData.state.withdrawable ?? "0") || 0);
        setLivePositions(
          (accData.state.assetPositions as Array<{ position: HLLivePosition }>)
            .map((p) => p.position)
            .filter((p) => parseFloat(p.szi) !== 0)
        );
      }
      if (typeof accData.spotUsdcBalance === "number") {
        setSpotUsdcBalance(accData.spotUsdcBalance);
      }

      // Parse TP/SL trigger orders (frontendOpenOrders) by coin
      const orders: any[] = Array.isArray(accData.orders) ? accData.orders : [];
      setOpenOrders(orders);
      const byCoin: Record<string, { tp?: number; sl?: number }> = {};
      for (const o of orders) {
        const px = parseFloat(o.triggerPx ?? o.triggerPrice ?? "0");
        if (!px) continue;
        const isTp = (o.orderType && /take profit/i.test(o.orderType)) || o.tpsl === "tp";
        const isSl = (o.orderType && /stop/i.test(o.orderType)) || o.tpsl === "sl";
        if (!byCoin[o.coin]) byCoin[o.coin] = {};
        if (isTp) byCoin[o.coin].tp = px;
        else if (isSl) byCoin[o.coin].sl = px;
      }
      setTriggers(byCoin);

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

  // Submit any HL action — server signs with the API wallet key (no wallet popup needed)
  const submitAction = useCallback(async (action: object): Promise<any> => {
    const res = await fetch("/api/hl/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Trade failed");
    return data;
  }, []);

  // Set leverage (must be done before first order on a new asset)
  const setLeverage = useCallback(async (asset: Asset, leverage: number, isCross = true) => {
    const meta = assetMeta[asset];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    return submitAction(buildSetLeverageAction(meta.assetId, Math.min(leverage, meta.maxLeverage), isCross));
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
      const meta = assetMeta[asset];
      if (!meta) throw new Error(`Meta not loaded for ${asset}`);

      const isBuy = direction === "long";
      // 1% slippage tolerance for market orders
      const limitPx = isBuy ? currentPrice * 1.01 : currentPrice * 0.99;
      const sz = sizeUsd / currentPrice;

      const action = buildOrderAction(meta.assetId, isBuy, limitPx, sz, false, "Ioc", meta.szDecimals);
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
      const meta = assetMeta[asset];
      if (!meta) throw new Error(`Meta not loaded for ${asset}`);

      const isBuy = direction === "short"; // close short = buy back
      const limitPx = isBuy ? currentPrice * 1.01 : currentPrice * 0.99;
      const action = buildOrderAction(meta.assetId, isBuy, limitPx, size, true, "Ioc", meta.szDecimals); // reduceOnly
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
    const meta = assetMeta[asset];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    return submitAction(buildCancelAction(meta.assetId, orderId));
  }, [assetMeta, submitAction]);

  // Cancel by HL coin name (handles "xyz:TSLA" → TSLA registry lookup)
  const cancelOrderByCoin = useCallback(async (coin: string, orderId: number) => {
    const ticker = coin.replace(/^xyz:/, "");
    const meta = assetMeta[ticker];
    if (!meta) throw new Error(`Meta not loaded for ${coin}`);
    setLoading(true);
    setError(null);
    try {
      const res = await submitAction(buildCancelAction(meta.assetId, orderId));
      await refreshAccount();
      return res;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [assetMeta, submitAction, refreshAccount]);

  // Attach / update TP and/or SL trigger orders on a position
  const setTpSl = useCallback(async ({
    asset, positionIsLong, size, takeProfit, stopLoss,
  }: {
    asset: Asset;
    positionIsLong: boolean;
    size: number;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }) => {
    const meta = assetMeta[asset];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    if (!takeProfit && !stopLoss) return;
    setLoading(true);
    setError(null);
    try {
      // Single positionTpsl action with both triggers — no main order
      const result = await submitAction(
        buildPositionTpSlAction(meta.assetId, positionIsLong, size, takeProfit, stopLoss, meta.szDecimals)
      );
      await refreshAccount();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [assetMeta, submitAction, refreshAccount]);

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
      const meta = assetMeta[params.asset];
      if (!meta) throw new Error(`Meta not loaded for ${params.asset}`);
      const action = buildOrderAction(
        meta.assetId, params.isBuy, params.price, params.size,
        params.reduceOnly ?? false, params.tif ?? "Gtc", meta.szDecimals
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

  // Hyperliquid uses unified spot + perp margin, so total account value is the
  // perp equity PLUS any USDC sitting in the spot wallet.
  const perpEquity = account ? parseFloat(account.accountValue) : 0;
  const totalBalance = perpEquity + spotUsdcBalance;                 // total equity
  // Free collateral that isn't already tied up as margin in open positions
  const availableBalance = withdrawable + spotUsdcBalance;
  const balanceInSpotOnly = perpEquity === 0 && spotUsdcBalance > 0; // nothing in perp yet

  return {
    account,
    livePositions,
    assetMeta,
    spotUsdcBalance,
    withdrawable,
    triggers,
    openOrders,
    cancelOrderByCoin,
    totalBalance,
    balanceInSpotOnly,
    availableBalance,
    loading,
    error,
    isLive: tradingMode === "live",
    refreshAccount,
    setLeverage,
    placeOrder,
    setTpSl,
    placeMarketOrder,
    closeLivePosition,
    cancelOrder,
    submitAction,
  };
}
