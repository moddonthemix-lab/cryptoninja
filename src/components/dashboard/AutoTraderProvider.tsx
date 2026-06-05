"use client";

import { createContext, useContext, useEffect } from "react";
import { useAutoTrader, type AutoTraderStatus } from "@/hooks/useAutoTrader";
import { useStore } from "@/store/useStore";

// Runs the auto-trader engine ONCE, app-wide (mounted in the dashboard layout),
// so scanning / trading / SL-TP-trailing keep working regardless of which tab or
// page you're on — as long as the browser is open. The panel reads this status
// via context instead of starting its own (duplicate) engine.
const Ctx = createContext<AutoTraderStatus | null>(null);

export function useAutoTraderStatus(): AutoTraderStatus | null {
  return useContext(Ctx);
}

export function AutoTraderProvider({ children }: { children: React.ReactNode }) {
  const botAsset = useStore((s) => s.botAsset);
  const status = useAutoTrader(botAsset);

  // Heartbeat so the server cron defers to this browser while it's open.
  useEffect(() => {
    const ping = () => { fetch("/api/cron/heartbeat", { method: "POST" }).catch(() => {}); };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, []);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}
