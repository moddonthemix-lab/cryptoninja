"use client";

import { useEffect, useRef, memo } from "react";
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type IPriceLine,
} from "lightweight-charts";
import { ASSETS } from "@/types";

interface NativeChartProps {
  asset: string;
  timeframe?: string;
  height?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

// Candle chart fed directly from Hyperliquid data — used for markets with no
// CEX/TradingView listing (e.g. the xyz builder-dex DRAM index).
export const NativeChart = memo(function NativeChart({
  asset,
  timeframe = "1h",
  height = 520,
  entryPrice,
  stopLoss,
  takeProfit,
}: NativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#12121a" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e1e2e" },
      timeScale: { borderColor: "#1e1e2e", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    let cancelled = false;

    const loadCandles = async () => {
      try {
        const res = await fetch(`/api/hl/candles?asset=${asset}&interval=${timeframe}&limit=300`);
        const data = await res.json();
        if (cancelled || !data.candles || !seriesRef.current) return;
        const bars = data.candles
          .map((c: any) => ({
            time: c.time as UTCTimestamp,
            open: c.open, high: c.high, low: c.low, close: c.close,
          }))
          .sort((a: any, b: any) => a.time - b.time);
        seriesRef.current.setData(bars);
        chartRef.current?.timeScale().fitContent();
      } catch {
        // silent — chart stays empty if HL is unreachable
      }
    };

    loadCandles();
    const poll = setInterval(loadCandles, 30_000);

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      clearInterval(poll);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [asset, timeframe, height]);

  // Draw / update entry, SL, TP price lines without recreating the chart
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    priceLinesRef.current.forEach((pl) => series.removePriceLine(pl));
    priceLinesRef.current = [];

    const add = (price: number | undefined, color: string, title: string, style: LineStyle) => {
      if (!price) return;
      priceLinesRef.current.push(
        series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })
      );
    };
    add(entryPrice, "#a855f7", "Entry", LineStyle.Solid);
    add(stopLoss, "#ef4444", "SL", LineStyle.Dashed);
    add(takeProfit, "#10b981", "TP", LineStyle.Dashed);
  }, [entryPrice, stopLoss, takeProfit]);

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-ninja-border/60 bg-ninja-bg/60 text-xs">
        <span className="font-bold text-ninja-accent">{asset}</span>
        <span className="text-ninja-muted">
          {ASSETS[asset]?.name ?? asset} · Hyperliquid xyz perps · native chart
        </span>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
});
