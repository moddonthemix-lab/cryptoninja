"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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

// ── Shared singleton account poller ──────────────────────────────────────────
// useHyperliquid() is mounted in many components; without sharing, each one polls
// independently. This runs ONE poll (every 20s) and fans the result out to all
// consumers, cutting client→server requests ~6×.
interface HLData {
  account: HLAccountSummary | null;
  livePositions: HLLivePosition[];
  assetMeta: Record<string, AssetMeta>;
  spotUsdcBalance: number;
  withdrawable: number;
  triggers: Record<string, { tp?: number; sl?: number }>;
  openOrders: any[];
}
let hlData: HLData = { account: null, livePositions: [], assetMeta: {}, spotUsdcBalance: 0, withdrawable: 0, triggers: {}, openOrders: [] };
const hlListeners = new Set<() => void>();
let hlTimer: ReturnType<typeof setInterval> | null = null;
let hlRefs = 0;
let hlAddr: string | undefined;
let hlInFlight = false;

async function hlPoll() {
  if (hlInFlight) return;
  hlInFlight = true;
  try {
    const accountUrl = hlAddr ? `/api/hl/account?address=${hlAddr}` : "/api/hl/account";
    const [accRes, metaRes] = await Promise.all([fetch(accountUrl), fetch("/api/hl/meta")]);
    const accData = await accRes.json();
    const meta = await metaRes.json();
    const next: HLData = { ...hlData };
    if (accData.state?.crossMarginSummary) {
      next.account = accData.state.crossMarginSummary;
      next.withdrawable = parseFloat(accData.state.withdrawable ?? "0") || 0;
      next.livePositions = (accData.state.assetPositions as Array<{ position: HLLivePosition }>)
        .map((p) => p.position).filter((p) => parseFloat(p.szi) !== 0);
    }
    if (typeof accData.spotUsdcBalance === "number") next.spotUsdcBalance = accData.spotUsdcBalance;
    const orders: any[] = Array.isArray(accData.orders) ? accData.orders : [];
    next.openOrders = orders;
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
    next.triggers = byCoin;
    if (!meta.error) next.assetMeta = meta;
    hlData = next;
    hlListeners.forEach((l) => l());
  } catch (e: any) {
    console.error("HL account fetch:", e?.message);
  } finally {
    hlInFlight = false;
  }
}
function hlSubscribe(cb: () => void) {
  hlListeners.add(cb); hlRefs++;
  if (hlRefs === 1) { hlPoll(); hlTimer = setInterval(hlPoll, 20_000); }
  return () => {
    hlListeners.delete(cb); hlRefs = Math.max(0, hlRefs - 1);
    if (hlRefs === 0 && hlTimer) { clearInterval(hlTimer); hlTimer = null; }
  };
}
const hlGetSnapshot = () => hlData;

export function useHyperliquid() {
  const { address } = useAccount();
  const { tradingMode } = useStore();
  const data = useSyncExternalStore(hlSubscribe, hlGetSnapshot, hlGetSnapshot);
  const { account, livePositions, assetMeta, spotUsdcBalance, withdrawable, triggers, openOrders } = data;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the shared poller pointed at the current address
  useEffect(() => { hlAddr = address; }, [address]);

  const refreshAccount = useCallback(async () => { hlAddr = address; await hlPoll(); }, [address]);

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

  // Set leverage (must be done before first order on a new asset).
  // Stocks/commodities on the xyz dex only allow ISOLATED margin (not cross).
  const setLeverage = useCallback(async (asset: Asset, leverage: number, isCross = true) => {
    const meta = assetMeta[asset];
    if (!meta) throw new Error(`Meta not loaded for ${asset}`);
    const cross = meta.dex === "xyz" ? false : isCross;
    return submitAction(buildSetLeverageAction(meta.assetId, Math.min(leverage, meta.maxLeverage), cross));
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

  // Hyperliquid Unified Account: clearinghouseState.accountValue is the full
  // Portfolio Value (perps + spot + all dexes as unified collateral). Do NOT add
  // spot/xyz separately — that double-counts under a unified account.
  const perpEquity = account ? parseFloat(account.accountValue) : 0;
  const totalBalance = perpEquity > 0 ? perpEquity : spotUsdcBalance;     // Portfolio Value
  const totalMarginUsed = account ? parseFloat(account.totalMarginUsed) || 0 : 0;
  // "Available to Trade" = free collateral. Take the largest valid measure so we
  // never under-report when funds exist: accountValue − marginUsed, withdrawable,
  // or spot USDC. (`withdrawable` is ~0 on a unified account with open positions.)
  const freeCollateral = Math.max(0, perpEquity - totalMarginUsed);
  const availableBalance = Math.max(freeCollateral, withdrawable, spotUsdcBalance);
  const balanceInSpotOnly = perpEquity === 0 && spotUsdcBalance > 0;

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
    totalMarginUsed,
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
