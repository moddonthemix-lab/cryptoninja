// Hyperliquid REST API client
// Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api

const HL_API = "https://api.hyperliquid.xyz";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HLAssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface HLMarketData {
  coin: string;
  markPx: string;      // mark price
  midPx: string | null;
  fundingRate: string;
  openInterest: string;
  dayNtlVlm: string;   // 24h notional volume
  premium: string;
  oraclePx: string;
}

export interface HLPosition {
  coin: string;
  szi: string;         // size (negative = short)
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  leverage: { type: "cross" | "isolated"; value: number };
  maxTradeSzs: [string, string];
}

export interface HLOpenOrder {
  coin: string;
  side: "B" | "A";   // B = buy, A = sell/ask
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
}

export interface HLAccountState {
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  assetPositions: Array<{ position: HLPosition; type: "oneWay" }>;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
}

export interface HLCandle {
  t: number;   // open time ms
  T: number;   // close time ms
  o: string;
  h: string;
  c: string;
  l: string;
  v: string;   // volume
  n: number;   // num trades
}

export interface HLOrderRequest {
  coin: string;
  isBuy: boolean;
  limitPx: number;
  sz: number;
  orderType: { limit: { tif: "Gtc" | "Ioc" | "Alo" } } | { market: {} };
  reduceOnly?: boolean;
  cloid?: string;
}

// ─── Info API (no auth required) ─────────────────────────────────────────────

async function infoPost<T>(body: object): Promise<T> {
  const res = await fetch(`${HL_API}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid info error: ${res.status}`);
  return res.json();
}

// Get all perpetuals metadata
export async function getMeta(): Promise<{ universe: HLAssetMeta[] }> {
  return infoPost({ type: "meta" });
}

// Get all mid prices
export async function getAllMids(): Promise<Record<string, string>> {
  return infoPost({ type: "allMids" });
}

// Get 24h market data for all assets
export async function getMarketData(): Promise<HLMarketData[]> {
  const res: Array<{ coin: string; ctx: HLMarketData }> = await infoPost({
    type: "metaAndAssetCtxs",
  });
  // metaAndAssetCtxs returns [meta, assetCtxs]
  const raw = res as unknown as [{ universe: HLAssetMeta[] }, HLMarketData[]];
  return raw[1];
}

// Get candles for a coin
export async function getCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime?: number
): Promise<HLCandle[]> {
  return infoPost({
    type: "candleSnapshot",
    req: {
      coin,
      interval,
      startTime,
      endTime: endTime ?? Date.now(),
    },
  });
}

// Get user account state (positions, balances)
export async function getUserState(address: string): Promise<HLAccountState> {
  return infoPost({ type: "clearinghouseState", user: address.toLowerCase() });
}

// Get user open orders
export async function getOpenOrders(address: string): Promise<HLOpenOrder[]> {
  return infoPost({ type: "openOrders", user: address.toLowerCase() });
}

// Get user open orders WITH trigger details (triggerPx, orderType, tpsl side, etc.)
export async function getFrontendOpenOrders(address: string): Promise<any[]> {
  return infoPost({ type: "frontendOpenOrders", user: address.toLowerCase() });
}

// Get user trade history
export async function getUserFills(address: string): Promise<any[]> {
  return infoPost({ type: "userFills", user: address.toLowerCase() });
}

// ─── Asset helpers ────────────────────────────────────────────────────────────

// Our assets mapped to Hyperliquid coin names
export const HL_COINS: Record<string, string> = {
  BTC: "BTC",
  ETH: "ETH",
  HYPE: "HYPE",
  SOL: "SOL",
};

// Map candle interval labels to Hyperliquid interval strings
export const HL_INTERVALS: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

// Convert our timeframe to ms lookback
export function intervalToLookback(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60 * 60 * 1000,          // 1h of 1m candles
    "5m": 5 * 60 * 60 * 1000,      // 5h of 5m candles
    "15m": 15 * 60 * 60 * 1000,    // 15h of 15m candles
    "1h": 7 * 24 * 60 * 60 * 1000, // 7d of 1h candles
    "4h": 30 * 24 * 60 * 60 * 1000, // 30d of 4h candles
    "1d": 365 * 24 * 60 * 60 * 1000, // 1yr of daily candles
  };
  return map[interval] ?? 7 * 24 * 60 * 60 * 1000;
}

// ─── Exchange API (requires EIP-712 signature from wallet) ───────────────────
// The actual signing happens client-side via wagmi/viem — these helpers
// build the typed data that the user signs.

export const HL_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 42161, // Arbitrum (Hyperliquid settles on Arbitrum)
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
};

export interface HLOrderWire {
  a: number;   // asset index
  b: boolean;  // isBuy
  p: string;   // price
  s: string;   // size
  r: boolean;  // reduceOnly
  t: { limit: { tif: string } } | { market: {} };
  c?: string;  // cloid (optional client order id)
}

export function buildOrderTypes() {
  return {
    Order: [
      { name: "asset", type: "uint32" },
      { name: "isBuy", type: "bool" },
      { name: "limitPx", type: "string" },
      { name: "sz", type: "string" },
      { name: "reduceOnly", type: "bool" },
      { name: "cloid", type: "string" },
    ],
    Agent: [
      { name: "source", type: "string" },
      { name: "connectionId", type: "bytes32" },
    ],
  } as const;
}

// Format a float to Hyperliquid wire format (mimics the Python SDK float_to_wire):
// fixed 8 decimals, strip trailing zeros, no exponential, no "-0".
export function floatToWire(x: number): string {
  let s = x.toFixed(8);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (s === "-0") s = "0";
  return s;
}

// Round and format a PRICE per HL rules: max 5 significant figures AND at most
// (MAX_DECIMALS - szDecimals) decimal places. MAX_DECIMALS = 6 for perps.
export function priceToWire(px: number, szDecimals: number): string {
  const sigFig = parseFloat(px.toPrecision(5));
  const allowedDecimals = Math.max(0, 6 - szDecimals);
  const rounded = parseFloat(sigFig.toFixed(allowedDecimals));
  return floatToWire(rounded);
}

// Round and format a SIZE to the asset's szDecimals.
export function sizeToWire(sz: number, szDecimals: number): string {
  return floatToWire(parseFloat(sz.toFixed(szDecimals)));
}

// Build the action payload for placing an order (to be sent after signing).
// szDecimals comes from the asset meta and controls price/size precision.
export function buildOrderAction(
  assetIndex: number,
  isBuy: boolean,
  price: number,
  size: number,
  reduceOnly: boolean = false,
  tif: "Gtc" | "Ioc" | "Alo" = "Gtc",
  szDecimals: number = 2
) {
  return {
    type: "order",
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: priceToWire(price, szDecimals),
        s: sizeToWire(size, szDecimals),
        r: reduceOnly,
        t: { limit: { tif } },
      },
    ],
    grouping: "na",
  };
}

// Build TP and/or SL trigger orders (reduce-only) to attach to an EXISTING
// position. Uses grouping "positionTpsl" — required when there's no main order
// (sending triggers under "normalTpsl" causes "Main order cannot be trigger order").
// `positionIsLong` is the direction of the OPEN position; the triggers close it,
// so a long position's TP/SL are sell (isBuy=false) orders and vice-versa.
export function buildPositionTpSlAction(
  assetIndex: number,
  positionIsLong: boolean,
  size: number,
  takeProfit: number | null | undefined,
  stopLoss: number | null | undefined,
  szDecimals: number = 2
) {
  const isBuy = !positionIsLong; // closing order is opposite side
  const orders: any[] = [];
  // For a MARKET trigger, the limit price (p) is the worst acceptable fill once
  // triggered. To guarantee the close fills, bias it 10% in the closing
  // direction: a sell (closing a long) accepts lower; a buy (closing a short)
  // accepts higher. HL still fills at market; this is just the protective bound.
  const SLIP = 0.1;
  const mk = (triggerPx: number, tpsl: "tp" | "sl") => {
    const limitPx = isBuy ? triggerPx * (1 + SLIP) : triggerPx * (1 - SLIP);
    return {
      a: assetIndex,
      b: isBuy,
      p: priceToWire(limitPx, szDecimals),
      s: sizeToWire(size, szDecimals),
      r: true, // reduceOnly
      t: { trigger: { isMarket: true, triggerPx: priceToWire(triggerPx, szDecimals), tpsl } },
    };
  };
  if (takeProfit && takeProfit > 0) orders.push(mk(takeProfit, "tp"));
  if (stopLoss && stopLoss > 0) orders.push(mk(stopLoss, "sl"));
  return { type: "order", orders, grouping: "positionTpsl" };
}

// Build cancel action
export function buildCancelAction(assetIndex: number, orderId: number) {
  return {
    type: "cancel",
    cancels: [{ a: assetIndex, o: orderId }],
  };
}

// Build set leverage action
export function buildSetLeverageAction(
  assetIndex: number,
  leverage: number,
  isCross: boolean = true
) {
  return {
    type: "updateLeverage",
    asset: assetIndex,
    isCross,
    leverage,
  };
}

// Send a signed action to the exchange endpoint
export async function sendExchangeAction(
  action: object,
  nonce: number,
  signature: { r: string; s: string; v: number }
): Promise<{ status: string; response?: any }> {
  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, nonce, signature }),
  });
  if (!res.ok) throw new Error(`Hyperliquid exchange error: ${res.status}`);
  return res.json();
}
