// Server-side auto-trader state (module memory; persists while the Railway
// container is running, resets on redeploy). Tracks the daily trade cap,
// cooldown, and per-position trailing progress for the cron loop.

export interface ServerTrail { peakPnl: number; locked: number; }

export const botState = {
  tradesDate: "",
  tradesToday: 0,
  lastTradeTs: 0,
  lastHeartbeat: 0,   // last time an open browser pinged in (for cron handoff)
  trail: {} as Record<string, ServerTrail>,
};

export function serverTradesToday(): number {
  const today = new Date().toISOString().slice(0, 10); // UTC day on the server
  return botState.tradesDate === today ? botState.tradesToday : 0;
}

export function recordServerTrade(): void {
  const today = new Date().toISOString().slice(0, 10);
  botState.tradesToday = botState.tradesDate === today ? botState.tradesToday + 1 : 1;
  botState.tradesDate = today;
  botState.lastTradeTs = Date.now();
}
