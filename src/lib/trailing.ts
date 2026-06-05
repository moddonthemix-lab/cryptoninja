// Shared ratcheting profit-lock trailing stop, used by the auto-trader and the
// copy-trade engine so both register positions for the same trailing monitor.
//
// Ladder:
//   • +20% profit → lock +7%, then +7% more every +20% (so 40%→14%) up to +60%
//   • at +60% profit → jump the locked stop to +40%
//   • beyond +60% → lock +9% more every +25% (85%→49%, 110%→58%, …) up to TP
export const TRAIL_ARM_PCT = 20;   // start locking once profit reaches this

export function lockTarget(pnlPct: number): number {
  if (pnlPct < 20) return 0;
  if (pnlPct < 60) return 7 + 7 * Math.floor((pnlPct - 20) / 20); // 20→7, 40→14
  return 40 + 9 * Math.floor((pnlPct - 60) / 25);                 // 60→40, 85→49, 110→58…
}

export interface TrailMeta {
  peakPrice: number;
  trailTriggerPct: number;
  trailRetreatPct: number;
  leverage: number;
  direction: "long" | "short";
  lockedPct: number;        // current ratcheted profit lock
}

// Per-position trailing metadata (lives only in memory, keyed by position id)
export const trailMeta: Record<string, TrailMeta> = {};
