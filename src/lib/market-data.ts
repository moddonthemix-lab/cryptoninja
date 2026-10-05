import type { Asset, Candle, MarketData } from "@/types";
import { ASSETS, ASSET_LIST } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

const HL_INTERVAL_MS: Record<string, number> = {
  "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000,
};

function coinOf(asset: Asset): string {
  return ASSETS[asset]?.hlCoin ?? asset;
}
function dexOf(asset: Asset): string {
  return ASSETS[asset]?.dex ?? "";
}

// ── Candles (routed to the right dex) ──────────────────────────────────────
export async function fetchCandles(asset: Asset, interval = "1h", limit = 200): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - (HL_INTERVAL_MS[interval] ?? 3600000) * limit;
  const dex = dexOf(asset);
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin: coinOf(asset), interval, startTime, endTime, ...(dex ? { dex } : {}) },
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

function ctxToMarketData(asset: Asset, ctx: any): MarketData {
  const price = parseFloat(ctx.markPx);
  const prev = parseFloat(ctx.prevDayPx);
  const change = price - prev;
  return {
    asset,
    price,
    change24h: change,
    changePercent24h: prev ? (change / prev) * 100 : 0,
    volume24h: parseFloat(ctx.dayNtlVlm ?? "0"),
    high24h: Math.max(price, prev),
    low24h: Math.min(price, prev),
    timestamp: Date.now(),
  };
}

// Fetch one dex's meta+ctxs and return a coin-name → ctx map
async function fetchDexCtxs(dex: string): Promise<Record<string, any>> {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs", ...(dex ? { dex } : {}) }),
    next: { revalidate: 15 },
  });
  if (!res.ok) throw new Error(`HL ctx error (${dex || "main"})`);
  const [meta, ctxs] = await res.json();
  const map: Record<string, any> = {};
  meta.universe.forEach((m: any, i: number) => { map[m.name] = ctxs[i]; });
  return map;
}

export async function fetchMarketData(asset: Asset): Promise<MarketData> {
  try {
    const map = await fetchDexCtxs(dexOf(asset));
    const ctx = map[coinOf(asset)];
    if (!ctx) throw new Error("not found");
    return ctxToMarketData(asset, ctx);
  } catch {
    return generateMockMarketData(asset);
  }
}

// Fetch prices for a set of tickers (default: everything in the registry),
// making at most one request per dex (main + each builder dex in use).
export async function fetchAllMarketData(
  assets: Asset[] = ASSET_LIST
): Promise<Record<Asset, MarketData>> {
  const dexes = Array.from(new Set(assets.map(dexOf)));
  const empty: Record<string, any> = {};
  const maps = await Promise.all(
    dexes.map((d) => fetchDexCtxs(d).then((m) => [d, m] as const).catch(() => [d, empty] as const))
  );
  const byDex = Object.fromEntries(maps) as Record<string, Record<string, any>>;

  const result: Record<Asset, MarketData> = {};
  for (const asset of assets) {
    const ctx = byDex[dexOf(asset)]?.[coinOf(asset)];
    result[asset] = ctx ? ctxToMarketData(asset, ctx) : generateMockMarketData(asset);
  }
  return result;
}

function generateMockMarketData(asset: Asset): MarketData {
  return {
    asset, price: 0, change24h: 0, changePercent24h: 0,
    volume24h: 0, high24h: 0, low24h: 0, timestamp: Date.now(),
  };
}
