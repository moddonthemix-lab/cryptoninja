// Shared ratcheting profit-lock trailing stop, used by the auto-trader and the
// copy-trade engine so both register positions for the same trailing monitor.
//   at +15% profit → lock +5%; then every additional +20% → lock another +7%
export const TRAIL_ARM_PCT = 15;    // start locking once profit reaches this
export const TRAIL_FIRST_LOCK = 5;  // first locked level
export const TRAIL_STEP_PCT = 20;   // each further profit step
export const TRAIL_STEP_LOCK = 7;   // lock added per step

export function lockTarget(pnlPct: number): number {
  if (pnlPct < TRAIL_ARM_PCT) return 0;
  return TRAIL_FIRST_LOCK + TRAIL_STEP_LOCK * Math.floor((pnlPct - TRAIL_ARM_PCT) / TRAIL_STEP_PCT);
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
