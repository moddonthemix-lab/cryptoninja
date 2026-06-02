import type { Asset, Candle, MarketData } from "@/types";
import { ASSETS } from "@/types";

const BINANCE_REST = "https://api.binance.com/api/v3";
const HL_INFO = "https://api.hyperliquid.xyz/info";

// Hyperliquid asset names match our Asset keys exactly
const HL_COINS: Record<Asset, string> = {
  BTC: "BTC",
  ETH: "ETH",
  HYPE: "HYPE",
  SOL: "SOL",
};

export async function fetchCandles(
  asset: Asset,
  interval: string = "1h",
  limit: number = 200
): Promise<Candle[]> {
  const pair = ASSETS[asset].binancePair;
  try {
    const res = await fetch(
      `${BINANCE_REST}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error("Binance API error");
    const data = await res.json();
    return data.map((k: any[]) => ({
      time: k[0] / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch {
    return fetchHLCandles(asset, interval, limit);
  }
}

async function fetchHLCandles(asset: Asset, interval: string, limit: number): Promise<Candle[]> {
  const intervalMap: Record<string, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
  };
  const endTime = Date.now();
  const intervalMs: Record<string, number> = {
    "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000,
  };
  const startTime = endTime - (intervalMs[interval] ?? 3600000) * limit;

  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin: HL_COINS[asset], interval: intervalMap[interval] ?? "60", startTime, endTime },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("HL candle error");
    const data = await res.json();
    return data.map((c: any) => ({
      time: c.t / 1000,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));
  } catch {
    return [];
  }
}

export async function fetchMarketData(asset: Asset): Promise<MarketData> {
  // Try Hyperliquid first — covers all 4 assets including HYPE
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      next: { revalidate: 15 },
    });
    if (!res.ok) throw new Error("HL error");
    const [meta, ctxs] = await res.json();
    const idx = meta.universe.findIndex((m: any) => m.name === HL_COINS[asset]);
    if (idx === -1) throw new Error("Asset not found");
    const ctx = ctxs[idx];
    const price = parseFloat(ctx.markPx);
    const prev = parseFloat(ctx.prevDayPx);
    const change = price - prev;
    return {
      asset,
      price,
      change24h: change,
      changePercent24h: (change / prev) * 100,
      volume24h: parseFloat(ctx.dayNtlVlm),
      high24h: Math.max(price, prev),
      low24h: Math.min(price, prev),
      timestamp: Date.now(),
    };
  } catch {
    // Binance fallback for BTC/ETH/SOL
    return fetchBinanceMarketData(asset);
  }
}

async function fetchBinanceMarketData(asset: Asset): Promise<MarketData> {
  const pair = ASSETS[asset].binancePair;
  try {
    const res = await fetch(`${BINANCE_REST}/ticker/24hr?symbol=${pair}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error("Binance error");
    const d = await res.json();
    return {
      asset,
      price: parseFloat(d.lastPrice),
      change24h: parseFloat(d.priceChange),
      changePercent24h: parseFloat(d.priceChangePercent),
      volume24h: parseFloat(d.volume),
      high24h: parseFloat(d.highPrice),
      low24h: parseFloat(d.lowPrice),
      timestamp: Date.now(),
    };
  } catch {
    return generateMockMarketData(asset);
  }
}

export async function fetchAllMarketData(): Promise<Record<Asset, MarketData>> {
  // Single HL call for all 4 assets
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      next: { revalidate: 15 },
    });
    if (!res.ok) throw new Error("HL error");
    const [meta, ctxs] = await res.json();
    const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];
    const result: Partial<Record<Asset, MarketData>> = {};
    for (const asset of assets) {
      const idx = meta.universe.findIndex((m: any) => m.name === HL_COINS[asset]);
      if (idx === -1) continue;
      const ctx = ctxs[idx];
      const price = parseFloat(ctx.markPx);
      const prev = parseFloat(ctx.prevDayPx);
      const change = price - prev;
      result[asset] = {
        asset,
        price,
        change24h: change,
        changePercent24h: (change / prev) * 100,
        volume24h: parseFloat(ctx.dayNtlVlm),
        high24h: Math.max(price, prev),
        low24h: Math.min(price, prev),
        timestamp: Date.now(),
      };
    }
    // Fill any missing with fallback
    for (const asset of assets) {
      if (!result[asset]) result[asset] = generateMockMarketData(asset);
    }
    return result as Record<Asset, MarketData>;
  } catch {
    const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];
    const results = await Promise.all(assets.map(fetchBinanceMarketData));
    return Object.fromEntries(assets.map((a, i) => [a, results[i]])) as Record<Asset, MarketData>;
  }
}

function generateMockMarketData(asset: Asset): MarketData {
  const basePrices: Record<Asset, number> = { BTC: 66000, ETH: 1850, HYPE: 69, SOL: 74 };
  const price = basePrices[asset];
  return {
    asset,
    price,
    change24h: 0,
    changePercent24h: 0,
    volume24h: 0,
    high24h: price,
    low24h: price,
    timestamp: Date.now(),
  };
}
