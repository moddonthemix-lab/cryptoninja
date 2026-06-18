"use client";

import { useEffect, useRef, memo } from "react";
import { ASSETS } from "@/types";
import { NativeChart } from "./NativeChart";

// Resolve the TradingView symbol from the asset registry, with a sane fallback.
function resolveSymbol(asset: string): string {
  const cfg = ASSETS[asset];
  if (cfg?.tvSymbol) return cfg.tvSymbol;
  const base = asset.replace(/-?USDC?$/i, "").toUpperCase();
  return `CRYPTO:${base}USD`;
}

// Markets with no TradingView listing (e.g. the xyz DRAM index) chart natively.
function hasTvListing(asset: string): boolean {
  return !!ASSETS[asset]?.tvSymbol;
}

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
  asset: string;
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
  const chartReadyRef = useRef(false);
  const shapeIdsRef = useRef<any[]>([]);
  const pricesRef = useRef({ entryPrice, stopLoss, takeProfit });
  pricesRef.current = { entryPrice, stopLoss, takeProfit };

  const useNative = !hasTvListing(asset);

  // Draw (or redraw) the entry/SL/TP lines, removing any previous ones first.
  const drawPriceLines = (widget: any) => {
    try {
      const chart = widget.activeChart();
      // Remove existing lines so updates don't stack
      for (const id of shapeIdsRef.current) {
        try { chart.removeEntity(id); } catch { /* ignore */ }
      }
      shapeIdsRef.current = [];

      const { entryPrice, stopLoss, takeProfit } = pricesRef.current;
      const add = (price: number, color: string, label: string, style: number, width: number, align: "top" | "bottom") => {
        const id = chart.createShape({ price }, {
          shape: "horizontal_line", lock: true, disableSelection: true, disableSave: true, zOrder: "top",
          overrides: { linecolor: color, linewidth: width, linestyle: style, showLabel: true, textcolor: color,
            text: `${label}  $${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, horzLabelsAlign: "right", vertLabelsAlign: align },
        });
        if (id) shapeIdsRef.current.push(id);
      };
      if (entryPrice) add(entryPrice, "#7c3aed", "Entry", 0, 2, "bottom");
      if (stopLoss) add(stopLoss, "#ef4444", "SL", 2, 1, "bottom");
      if (takeProfit) add(takeProfit, "#10b981", "TP", 2, 1, "top");
    } catch {
      // Chart drawing API unavailable in this widget tier — header legend covers it
    }
  };

  useEffect(() => {
    if (useNative) return; // native chart manages its own lifecycle
    const node = containerRef.current;
    if (!node) return;
    chartReadyRef.current = false;
    shapeIdsRef.current = [];

    // The keyed wrapper gives us a fresh empty node each asset/timeframe change,
    // so we can build the TradingView inner div imperatively without React ever
    // trying to reconcile (and crash on) the DOM that TradingView mutates.
    const containerId = `tv_${asset}_${timeframe}_${Math.random().toString(36).slice(2, 7)}`;
    const inner = document.createElement("div");
    inner.id = containerId;
    inner.style.height = `${height}px`;
    node.appendChild(inner);

    const loadWidget = () => {
      if (!window.TradingView || !document.getElementById(containerId)) return;
      try {
        const widget = new window.TradingView.widget({
          container_id: containerId,
          symbol: resolveSymbol(asset),
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
          height,
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
        widget.onChartReady(() => setTimeout(() => {
          chartReadyRef.current = true;
          drawPriceLines(widget);
        }, 500));
      } catch {
        // widget construction failed — leave the empty node, header legend still shows
      }
    };

    if (window.TradingView) {
      loadWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (existing) {
        existing.addEventListener("load", loadWidget);
      } else {
        const script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = loadWidget;
        document.head.appendChild(script);
      }
    }

    return () => {
      // Tear down the TradingView instance. We do NOT touch React-managed nodes;
      // the keyed wrapper is removed by React as a single unit.
      try { widgetRef.current?.remove?.(); } catch { /* ignore */ }
      widgetRef.current = null;
      chartReadyRef.current = false;
    };
  }, [asset, timeframe, height, useNative]);

  // Redraw lines whenever entry/SL/TP change (without reloading the chart)
  useEffect(() => {
    if (chartReadyRef.current && widgetRef.current) {
      drawPriceLines(widgetRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPrice, stopLoss, takeProfit]);

  // No TradingView listing (e.g. DRAM) → native Hyperliquid candle chart
  if (useNative) {
    return (
      <NativeChart
        asset={asset}
        timeframe={timeframe}
        height={height}
        entryPrice={entryPrice}
        stopLoss={stopLoss}
        takeProfit={takeProfit}
      />
    );
  }

  const hasLevels = entryPrice || stopLoss || takeProfit;

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {hasLevels && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-ninja-border/60 bg-ninja-bg/60 text-xs font-mono flex-wrap">
          {entryPrice && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-purple-500 inline-block rounded" />
              <span className="text-ninja-muted">Entry</span>
              <span className="text-purple-400 font-bold">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
          {stopLoss && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg,#ef4444 0,#ef4444 4px,transparent 4px,transparent 7px)" }} />
              <span className="text-ninja-muted">SL</span>
              <span className="text-red-400 font-bold">${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
          {takeProfit && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg,#10b981 0,#10b981 4px,transparent 4px,transparent 7px)" }} />
              <span className="text-ninja-muted">TP</span>
              <span className="text-green-400 font-bold">${takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </span>
          )}
          <span className="text-ninja-muted/40 ml-auto text-xs hidden lg:block">lines drawn on chart</span>
        </div>
      )}
      {/* keyed wrapper → React swaps the whole node on asset/timeframe change */}
      <div key={`${asset}-${timeframe}`} ref={containerRef} style={{ minHeight: height }} />
    </div>
  );
});
