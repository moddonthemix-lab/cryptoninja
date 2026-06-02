"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";

export function MarketTicker() {
  const { updateMarketData } = useStore();

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch("/api/ai/analyze");
        const data = await res.json();
        if (data.marketData) updateMarketData(data.marketData);
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [updateMarketData]);

  return null;
}
