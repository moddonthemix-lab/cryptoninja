"use client";

import { useEffect, useRef, memo } from "react";
import type { Asset } from "@/types";

const TV_SYMBOLS: Record<Asset, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  HYPE: "BYBIT:HYPEUSDT",
  SOL: "BINANCE:SOLUSDT",
};

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
  // Use refs so chart doesn't reload when only prices change
  const pricesRef = useRef({ entryPrice, stopLoss, takeProfit });
  pricesRef.current = { entryPrice, stopLoss, takeProfit };

  useEffect(() => {
    const containerId = `tv_widget_${asset}_${timeframe}`;
    if (!containerRef.current) return;

    containerRef.current.innerHTML = `<div id="${containerId}" style="height:${height}px"></div>`;

    const drawPriceLines = (widget: any) => {
      try {
        const chart = widget.activeChart();
        const { entryPrice, stopLoss, takeProfit } = pricesRef.current;

        if (entryPrice) {
          chart.createShape(
            { price: entryPrice },
            {
              shape: "horizontal_line",
              lock: true,
              disableSelection: true,
              disableSave: true,
              zOrder: "top",
              overrides: {
                linecolor: "#7c3aed",
                linewidth: 2,
                linestyle: 0,
                showLabel: true,
                textcolor: "#7c3aed",
                text: `Entry  $${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                horzLabelsAlign: "right",
                vertLabelsAlign: "bottom",
              },
            }
          );
        }

        if (stopLoss) {
          chart.createShape(
            { price: stopLoss },
            {
              shape: "horizontal_line",
              lock: true,
              disableSelection: true,
              disableSave: true,
              zOrder: "top",
              overrides: {
                linecolor: "#ef4444",
                linewidth: 1,
                linestyle: 2, // dashed
                showLabel: true,
                textcolor: "#ef4444",
                text: `SL  $${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                horzLabelsAlign: "right",
                vertLabelsAlign: "bottom",
              },
            }
          );
        }

        if (takeProfit) {
          chart.createShape(
            { price: takeProfit },
            {
              shape: "horizontal_line",
              lock: true,
              disableSelection: true,
              disableSave: true,
              zOrder: "top",
              overrides: {
                linecolor: "#10b981",
                linewidth: 1,
                linestyle: 2, // dashed
                showLabel: true,
                textcolor: "#10b981",
                text: `TP  $${takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                horzLabelsAlign: "right",
                vertLabelsAlign: "top",
              },
            }
          );
        }
      } catch {
        // Chart API unavailable in this widget tier — price labels shown in header instead
      }
    };

    const loadWidget = () => {
      if (!window.TradingView || !document.getElementById(containerId)) return;

      const widget = new window.TradingView.widget({
        container_id: containerId,
        symbol: TV_SYMBOLS[asset],
        interval: TV_INTERVALS[timeframe] || "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
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
        no_referral_id: true,
        hide_side_toolbar: false,
        withdateranges: true,
        details: true,
        hotlist: false,
        calendar: false,
      });

      widgetRef.current = widget;

      // Draw price lines after chart is ready
      widget.onChartReady(() => {
        // Small delay ensures the chart canvas is fully initialised
        setTimeout(() => drawPriceLines(widget), 500);
      });
    };

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

  const hasLevels = entryPrice || stopLoss || takeProfit;

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {/* Compact price level legend — always visible as backup */}
      {hasLevels && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-ninja-border/60 bg-ninja-bg/60 text-xs font-mono flex-wrap">
          {entryPrice && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-purple-500 inline-block rounded" />
              <span className="text-ninja-muted">Entry</span>
              <span className="text-purple-400 font-bold">
                ${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
          )}
          {stopLoss && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 inline-block rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg,#ef4444 0,#ef4444 4px,transparent 4px,transparent 7px)" }} />
              <span className="text-ninja-muted">SL</span>
              <span className="text-red-400 font-bold">
                ${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
          )}
          {takeProfit && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-green-500 inline-block rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg,#10b981 0,#10b981 4px,transparent 4px,transparent 7px)" }} />
              <span className="text-ninja-muted">TP</span>
              <span className="text-green-400 font-bold">
                ${takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
          )}
          <span className="text-ninja-muted/40 ml-auto text-xs hidden lg:block">lines drawn on chart</span>
        </div>
      )}
      <div ref={containerRef} style={{ minHeight: height }} />
    </div>
  );
});
