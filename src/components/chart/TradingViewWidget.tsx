"use client";

import { useEffect, useRef, memo } from "react";
import type { Asset } from "@/types";

// Map our asset names to TradingView symbols
const TV_SYMBOLS: Record<Asset, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  HYPE: "HYPERLIQUID:HYPEUSDT.P",
  SOL: "BINANCE:SOLUSDT",
};

// Map our timeframe values to TradingView intervals
const TV_INTERVALS: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "D",
  "1w": "W",
};

interface TradingViewWidgetProps {
  asset: Asset;
  timeframe?: string;
  height?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

declare global {
  interface Window {
    TradingView?: any;
  }
}

export const TradingViewWidget = memo(function TradingViewWidget({
  asset,
  timeframe = "1h",
  height = 460,
  entryPrice,
  stopLoss,
  takeProfit,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const containerId = `tv_widget_${asset}_${timeframe}`;
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = `<div id="${containerId}" style="height:${height}px"></div>`;

    const loadWidget = () => {
      if (!window.TradingView || !document.getElementById(containerId)) return;

      widgetRef.current = new window.TradingView.widget({
        container_id: containerId,
        symbol: TV_SYMBOLS[asset],
        interval: TV_INTERVALS[timeframe] || "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1", // candlestick
        locale: "en",
        toolbar_bg: "#12121a",
        enable_publishing: false,
        allow_symbol_change: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        backgroundColor: "#12121a",
        gridColor: "#1e1e2e",
        width: "100%",
        height: height,
        studies: [],
        show_popup_button: false,
        popup_width: "1000",
        popup_height: "650",
        no_referral_id: true,
        hide_side_toolbar: false,
        withdateranges: true,
        details: true,
        hotlist: false,
        calendar: false,
      });
    };

    // Load TradingView script if not already loaded
    if (window.TradingView) {
      loadWidget();
    } else {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = loadWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove?.(); } catch {}
        widgetRef.current = null;
      }
    };
  }, [asset, timeframe, height]);

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {/* Price lines panel — shown above chart */}
      {(entryPrice || stopLoss || takeProfit) && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-ninja-border bg-ninja-card text-xs font-mono flex-wrap">
          {entryPrice && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-ninja-accent inline-block" />
              <span className="text-ninja-muted">Entry</span>
              <span className="text-ninja-accent font-bold">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
          {stopLoss && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-ninja-red inline-block border-t border-dashed border-ninja-red" />
              <span className="text-ninja-muted">Stop Loss</span>
              <span className="text-ninja-red font-bold">${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
          {takeProfit && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-ninja-green inline-block border-t border-dashed border-ninja-green" />
              <span className="text-ninja-muted">Take Profit</span>
              <span className="text-ninja-green font-bold">${takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
        </div>
      )}
      <div ref={containerRef} style={{ minHeight: height }} />
    </div>
  );
});
