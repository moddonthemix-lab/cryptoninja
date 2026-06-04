import { NextRequest, NextResponse } from "next/server";

// Hyperliquid's public leaderboard (same source their web app uses)
const LB_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const TTL_MS = 10 * 60_000;

let cache: { ts: number; rows: any[] } | null = null;

type Win = "day" | "week" | "month" | "allTime";

async function loadRows(): Promise<any[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rows;
  const res = await fetch(LB_URL, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  const data = await res.json();
  const rows = data?.leaderboardRows ?? [];
  cache = { ts: Date.now(), rows };
  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const window = (searchParams.get("window") as Win) || "month";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 1000);

  try {
    const rows = await loadRows();
    const mapped = rows.map((r: any) => {
      const perfs: Array<[string, { pnl: string; roi: string; vlm: string }]> = r.windowPerformances ?? [];
      const w = perfs.find(([name]) => name === window)?.[1];
      return {
        address: r.ethAddress,
        name: r.displayName || null,
        accountValue: parseFloat(r.accountValue ?? "0") || 0,
        pnl: parseFloat(w?.pnl ?? "0") || 0,
        roi: (parseFloat(w?.roi ?? "0") || 0) * 100, // %
        vlm: parseFloat(w?.vlm ?? "0") || 0,
      };
    }).filter((r: any) => r.address);

    mapped.sort((a: any, b: any) => b.roi - a.roi);
    return NextResponse.json({ window, count: mapped.length, rows: mapped.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
