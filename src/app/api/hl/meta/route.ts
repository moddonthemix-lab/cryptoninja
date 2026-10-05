export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ASSETS, ASSET_LIST } from "@/types";
import { dexAssetId } from "@/lib/hyperliquid";

const HL_INFO = "https://api.hyperliquid.xyz/info";

async function fetchMeta(dex: string) {
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta", ...(dex ? { dex } : {}) }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`meta error (${dex || "main"})`);
  return res.json() as Promise<{ universe: Array<{ name: string; szDecimals: number; maxLeverage: number }> }>;
}

export interface AssetMetaEntry {
  assetId: number;     // id to use in order / leverage actions
  szDecimals: number;
  maxLeverage: number;
  dex: string;
  hlCoin: string;
}

// Meta barely changes — cache the composed result and serve stale on error so a
// transient 429 from Hyperliquid never blanks out the asset metadata.
const META_TTL_MS = 5 * 60_000;
let metaCache: { ts: number; result: Record<string, AssetMetaEntry> } | null = null;

// Returns per-asset metadata keyed by our SHORT symbol. `assetId` is the encoded
// order asset id (plain index on the main dex, builder-encoded on a builder dex).
export async function GET() {
  if (metaCache && Date.now() - metaCache.ts < META_TTL_MS) {
    return NextResponse.json(metaCache.result);
  }
  try {
    // Every dex referenced by the registry (main "" plus each builder dex)
    const dexes = Array.from(new Set(ASSET_LIST.map((a) => ASSETS[a].dex)));
    const metas = await Promise.all(dexes.map((d) => fetchMeta(d).then((m) => [d, m] as const)));
    const metaByDex = Object.fromEntries(metas) as Record<string, { universe: Array<{ name: string; szDecimals: number; maxLeverage: number }> }>;

    // coin-name → {index, szDecimals, maxLeverage} per dex
    const byDex: Record<string, Record<string, { index: number; szDecimals: number; maxLeverage: number }>> = {};
    for (const [dex, meta] of Object.entries(metaByDex)) {
      const m: Record<string, { index: number; szDecimals: number; maxLeverage: number }> = {};
      meta.universe.forEach((u, i) => { m[u.name] = { index: i, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage }; });
      byDex[dex] = m;
    }

    const result: Record<string, AssetMetaEntry> = {};
    for (const sym of ASSET_LIST) {
      const cfg = ASSETS[sym];
      const u = byDex[cfg.dex]?.[cfg.hlCoin];
      if (!u) continue;
      result[sym] = {
        assetId: dexAssetId(cfg.dex, u.index),
        szDecimals: u.szDecimals,
        maxLeverage: u.maxLeverage,
        dex: cfg.dex,
        hlCoin: cfg.hlCoin,
      };
    }

    // Also expose EVERY main-dex perp keyed by its coin name, so copy trading /
    // wallet tracking work for any Hyperliquid asset (not just the curated list).
    const mainUniverse = metaByDex[""]?.universe ?? [];
    mainUniverse.forEach((m, i) => {
      if (!result[m.name]) {
        result[m.name] = { assetId: i, szDecimals: m.szDecimals, maxLeverage: m.maxLeverage, dex: "", hlCoin: m.name };
      }
    });

    metaCache = { ts: Date.now(), result };
    return NextResponse.json(result);
  } catch (e: any) {
    if (metaCache) return NextResponse.json(metaCache.result);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
