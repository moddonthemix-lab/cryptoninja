"use client";

import { useEffect, useRef, useState, memo } from "react";
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp,
} from "lightweight-charts";
import { ASSETS } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  asset: string;
  height?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;

export const LightweightChart = memo(function LightweightChart({
  asset, height = 520, entryPrice, stopLoss, takeProfit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#12121a" }, textColor: "#64748b", fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "#1e1e2e" }, horzLines: { color: "#1e1e2e" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e1e2e" },
      timeScale: { borderColor: "#1e1e2e", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#1e1e2e",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volSeriesRef.current = volSeries;

    const onResize = () => chart.applyOptions({ height });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [height]);

  // Load candles on asset / timeframe change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEmpty(false);
    (async () => {
      try {
        const res = await fetch(`/api/hl/candles?asset=${encodeURIComponent(asset)}&interval=${timeframe}&limit=400`);
        const data = await res.json();
        if (cancelled) return;
        const candles = (data.candles ?? []) as Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
        if (candles.length === 0) { setEmpty(true); setLoading(false); return; }

        candleSeriesRef.current?.setData(
          candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        volSeriesRef.current?.setData(
          candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "#10b98133" : "#ef444433" }))
        );
        chartRef.current?.timeScale().fitContent();
        setLoading(false);
      } catch {
        if (!cancelled) { setEmpty(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [asset, timeframe]);

  // Draw / update entry, SL, TP price lines reactively
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    // Remove old lines
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* ignore */ }
    }
    priceLinesRef.current = [];

    const add = (price: number, color: string, title: string, style: LineStyle) => {
      const line = series.createPriceLine({
        price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title,
      });
      priceLinesRef.current.push(line);
    };
    if (entryPrice) add(entryPrice, "#7c3aed", "Entry", LineStyle.Dotted);
    if (stopLoss) add(stopLoss, "#ef4444", "SL", LineStyle.Dotted);
    if (takeProfit) add(takeProfit, "#10b981", "TP", LineStyle.Dotted);
  }, [entryPrice, stopLoss, takeProfit, loading]);

  const cfg = ASSETS[asset];

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {/* Header: symbol + timeframe pills */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ninja-border/60">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color: cfg?.color }}>{asset}</span>
          <span className="text-ninja-muted text-xs">{cfg?.name}</span>
        </div>
        <div className="flex items-center gap-1 bg-ninja-bg/50 rounded-lg p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-bold transition-all",
                timeframe === tf ? "bg-ninja-accent text-white" : "text-ninja-muted hover:text-ninja-text"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} style={{ height }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-ninja-muted text-xs pointer-events-none">
            Loading chart…
          </div>
        )}
        {empty && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-ninja-muted text-xs">
            No chart data for {asset}
          </div>
        )}
      </div>
    </div>
  );
});
