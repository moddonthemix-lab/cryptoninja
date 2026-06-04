export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ASSETS, ASSET_LIST } from "@/types";

const HL_INFO = "https://api.hyperliquid.xyz/info";

// xyz is the 2nd entry in perpDexs ([null, {xyz}]) → perp_dex_index = 1.
// Builder-dex order asset id = 100000 + perp_dex_index * 10000 + index_in_dex.
const XYZ_ASSET_ID_BASE = 110000;

async function fetchMeta(dex: "" | "xyz") {
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
  assetId: number;     // id to use in order actions
  szDecimals: number;
  maxLeverage: number;
  dex: "" | "xyz";
  hlCoin: string;
}

// Meta barely changes — cache the composed result and serve stale on error so a
// transient 429 from Hyperliquid never blanks out the asset metadata.
const META_TTL_MS = 5 * 60_000;
let metaCache: { ts: number; result: Record<string, AssetMetaEntry> } | null = null;

export async function GET() {
  if (metaCache && Date.now() - metaCache.ts < META_TTL_MS) {
    return NextResponse.json(metaCache.result);
  }
  try {
    const needXyz = ASSET_LIST.some((a) => ASSETS[a].dex === "xyz");
    const [main, xyz] = await Promise.all([
      fetchMeta(""),
      needXyz ? fetchMeta("xyz") : Promise.resolve({ universe: [] }),
    ]);

    // Build coin-name → {index, szDecimals, maxLeverage} for each dex
    const mainByCoin: Record<string, { index: number; szDecimals: number; maxLeverage: number }> = {};
    main.universe.forEach((m, i) => { mainByCoin[m.name] = { index: i, szDecimals: m.szDecimals, maxLeverage: m.maxLeverage }; });

    const xyzByCoin: Record<string, { index: number; szDecimals: number; maxLeverage: number }> = {};
    xyz.universe.forEach((m, i) => { xyzByCoin[m.name] = { index: i, szDecimals: m.szDecimals, maxLeverage: m.maxLeverage }; });

    // Key the result by OUR ticker symbol
    const result: Record<string, AssetMetaEntry> = {};
    for (const sym of ASSET_LIST) {
      const cfg = ASSETS[sym];
      if (cfg.dex === "xyz") {
        const u = xyzByCoin[cfg.hlCoin];
        if (!u) continue;
        result[sym] = {
          assetId: XYZ_ASSET_ID_BASE + u.index,
          szDecimals: u.szDecimals,
          maxLeverage: u.maxLeverage,
          dex: "xyz",
          hlCoin: cfg.hlCoin,
        };
      } else {
        const u = mainByCoin[cfg.hlCoin];
        if (!u) continue;
        result[sym] = {
          assetId: u.index,
          szDecimals: u.szDecimals,
          maxLeverage: u.maxLeverage,
          dex: "",
          hlCoin: cfg.hlCoin,
        };
      }
    }

    metaCache = { ts: Date.now(), result };
    return NextResponse.json(result);
  } catch (e: any) {
    // Serve last good meta if we have it (survives transient 429s)
    if (metaCache) return NextResponse.json(metaCache.result);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
