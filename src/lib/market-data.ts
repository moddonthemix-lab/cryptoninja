import type { Asset, Candle, MarketData } from "@/types";
import { ASSETS } from "@/types";

const BINANCE_REST = "https://api.binance.com/api/v3";
const COINGECKO_REST = "https://api.coingecko.com/api/v3";

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
    return data.map((k: number[]) => ({
      time: k[0] / 1000,
      open: parseFloat(k[1] as unknown as string),
      high: parseFloat(k[2] as unknown as string),
      low: parseFloat(k[3] as unknown as string),
      close: parseFloat(k[4] as unknown as string),
      volume: parseFloat(k[5] as unknown as string),
    }));
  } catch {
    return generateMockCandles(asset, limit);
  }
}

export async function fetchMarketData(asset: Asset): Promise<MarketData> {
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
  const assets: Asset[] = ["BTC", "ETH", "HYPE", "SOL"];
  const results = await Promise.all(assets.map(fetchMarketData));
  return Object.fromEntries(assets.map((a, i) => [a, results[i]])) as Record<Asset, MarketData>;
}

function generateMockCandles(asset: Asset, count: number): Candle[] {
  const basePrices: Record<Asset, number> = { BTC: 65000, ETH: 3500, HYPE: 25, SOL: 170 };
  let price = basePrices[asset];
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.48) * price * 0.012;
    const open = price;
    price = Math.max(price + change, price * 0.9);
    const high = Math.max(open, price) * (1 + Math.random() * 0.005);
    const low = Math.min(open, price) * (1 - Math.random() * 0.005);
    candles.push({
      time: now - i * 3600,
      open,
      high,
      low,
      close: price,
      volume: Math.random() * 1000000,
    });
  }
  return candles;
}

function generateMockMarketData(asset: Asset): MarketData {
  const basePrices: Record<Asset, number> = { BTC: 65000, ETH: 3500, HYPE: 25, SOL: 170 };
  const price = basePrices[asset] * (1 + (Math.random() - 0.5) * 0.02);
  const change = (Math.random() - 0.5) * price * 0.04;
  return {
    asset,
    price,
    change24h: change,
    changePercent24h: (change / price) * 100,
    volume24h: Math.random() * 1e9,
    high24h: price * 1.03,
    low24h: price * 0.97,
    timestamp: Date.now(),
  };
}
