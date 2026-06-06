// Deep Eye data snapshot: the top Hyperliquid wallets + their current positions,
// cached so questions can be answered cheaply without re-scanning every time.
import { getUserState, getUserStateDex } from "./hyperliquid";
import { ASSETS } from "@/types";

const LB_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const TTL_MS = 15 * 60_000;
const WALLET_COUNT = 40;   // how many top wallets to scan
const CONCURRENCY = 5;

export interface IntelPosition { sym: string; dir: "long" | "short"; notional: number; lev: number; upnl: number; category: string; }
export interface IntelWallet {
  address: string; name: string | null;
  accountValue: number; roi: number; pnl: number; vlm: number;
  positions: IntelPosition[];
}
export interface IntelSnapshot { ts: number; window: string; wallets: IntelWallet[]; }

let cache: { ts: number; snap: IntelSnapshot } | null = null;
let building: Promise<IntelSnapshot> | null = null;

async function build(): Promise<IntelSnapshot> {
  const res = await fetch(LB_URL, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  const data = await res.json();
  const rows = ((data?.leaderboardRows ?? []) as any[]).map((r) => {
    const perfs: any[] = r.windowPerformances ?? [];
    const w = perfs.find(([n]) => n === "month")?.[1];
    return {
      address: r.ethAddress, name: r.displayName || null,
      accountValue: parseFloat(r.accountValue ?? "0") || 0,
      roi: (parseFloat(w?.roi ?? "0") || 0) * 100,
      pnl: parseFloat(w?.pnl ?? "0") || 0,
      vlm: parseFloat(w?.vlm ?? "0") || 0,
    };
  }).filter((r) => r.address);

  rows.sort((a, b) => b.vlm - a.vlm); // most active first
  const top = rows.slice(0, WALLET_COUNT);

  const out: IntelWallet[] = [];
  const queue = [...top];
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift()!;
      const positions: IntelPosition[] = [];
      try {
        const [main, xyz] = await Promise.all([getUserState(r.address), getUserStateDex(r.address, "xyz").catch(() => null)]);
        const coll = (st: any, dex: "" | "xyz") => ((st?.assetPositions) || []).forEach((ap: any) => {
          const p = ap.position; const szi = parseFloat(p.szi); if (!szi) return;
          const coin = dex === "xyz" && !String(p.coin).startsWith("xyz:") ? `xyz:${p.coin}` : p.coin;
          const sym = coin.replace(/^xyz:/, "");
          positions.push({
            sym, dir: szi > 0 ? "long" : "short",
            notional: parseFloat(p.positionValue || "0") || 0,
            lev: p.leverage?.value ?? 1,
            upnl: parseFloat(p.unrealizedPnl || "0") || 0,
            category: ASSETS[sym]?.category || "crypto",
          });
        });
        coll(main, ""); coll(xyz, "xyz");
      } catch { /* skip this wallet */ }
      out.push({ ...r, positions });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  out.sort((a, b) => b.vlm - a.vlm);
  return { ts: Date.now(), window: "month", wallets: out };
}

export async function getIntelSnapshot(): Promise<IntelSnapshot> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.snap;
  if (building) return building;
  building = build()
    .then((s) => { cache = { ts: Date.now(), snap: s }; building = null; return s; })
    .catch((e) => { building = null; throw e; });
  return building;
}
