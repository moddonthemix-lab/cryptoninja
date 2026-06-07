"use client";

import { createContext, useContext, useEffect } from "react";
import { useAutoTrader, type AutoTraderStatus } from "@/hooks/useAutoTrader";
import { useStore } from "@/store/useStore";
import { ASSETS } from "@/types";

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
  const paperEnabled = useStore((s) => s.paperEnabled);
  const tradingMode = useStore((s) => s.tradingMode);
  const status = useAutoTrader(botAsset);

  // Paper disabled → force LIVE so nothing can simulate (covers persisted state)
  useEffect(() => {
    if (!paperEnabled && tradingMode !== "live") useStore.getState().setTradingMode("live");
  }, [paperEnabled, tradingMode]);

  // Heartbeat so the server cron defers to this browser while it's open, and
  // syncs the copy config + currently-copied coins so the cron can take over.
  useEffect(() => {
    const ping = () => {
      const st = useStore.getState();
      const copyOpenCoins = st.openPositions
        .filter((p) => p.isOpen && p.id.startsWith("copy_"))
        .map((p) => ASSETS[p.asset]?.hlCoin || p.asset);
      fetch("/api/cron/heartbeat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyConfig: st.copyTrade, copyOpenCoins }),
      }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, []);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}
