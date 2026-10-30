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
  // When true, the SL and TP lines can be dragged; release fires the callbacks
  // with the new price so the caller can update the HL trigger orders.
  draggable?: boolean;
  onMoveSL?: (price: number) => void;
  onMoveTP?: (price: number) => void;
}

const COL = { entry: "#22d3ee", sl: "#ff4d5e", tp: "#2bff88" };

export const NativeChart = memo(function NativeChart({
  asset,
  timeframe = "1h",
  height = 520,
  entryPrice,
  stopLoss,
  takeProfit,
  draggable = false,
  onMoveSL,
  onMoveTP,
}: NativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  // Live mirrors of props/callbacks so the drag listeners (bound once) stay current
  const pxRef = useRef({ entryPrice, stopLoss, takeProfit });
  pxRef.current = { entryPrice, stopLoss, takeProfit };
  const cbRef = useRef({ draggable, onMoveSL, onMoveTP });
  cbRef.current = { draggable, onMoveSL, onMoveTP };

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "#050b06" }, textColor: "#8fcaa0" },
      grid: { vertLines: { color: "#11301d" }, horzLines: { color: "#11301d" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#11301d" },
      timeScale: { borderColor: "#11301d", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#2bff88", downColor: "#ff4d5e",
      borderUpColor: "#2bff88", borderDownColor: "#ff4d5e",
      wickUpColor: "#2bff88", wickDownColor: "#ff4d5e",
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
          .map((c: any) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
          .sort((a: any, b: any) => a.time - b.time);
        seriesRef.current.setData(bars);
        chartRef.current?.timeScale().fitContent();
      } catch { /* silent */ }
    };
    loadCandles();
    const poll = setInterval(loadCandles, 30_000);

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    // ── Drag handling for SL / TP ─────────────────────────────────────────
    let dragging: "sl" | "tp" | null = null;
    const HIT_PX = 7;

    const yToPrice = (clientY: number): number | null => {
      const rect = el.getBoundingClientRect();
      const y = clientY - rect.top;
      const p = series.coordinateToPrice(y);
      return p == null ? null : (p as number);
    };
    const nearLine = (clientY: number, price?: number): boolean => {
      if (!price) return false;
      const coord = series.priceToCoordinate(price);
      if (coord == null) return false;
      const rect = el.getBoundingClientRect();
      return Math.abs((clientY - rect.top) - (coord as number)) <= HIT_PX;
    };

    const onDown = (e: MouseEvent) => {
      if (!cbRef.current.draggable) return;
      const { stopLoss, takeProfit } = pxRef.current;
      if (nearLine(e.clientY, stopLoss)) dragging = "sl";
      else if (nearLine(e.clientY, takeProfit)) dragging = "tp";
      else return;
      // freeze chart pan/zoom while dragging a line
      chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!cbRef.current.draggable) return;
      if (!dragging) {
        // hover cursor feedback
        const { stopLoss, takeProfit } = pxRef.current;
        el.style.cursor = (nearLine(e.clientY, stopLoss) || nearLine(e.clientY, takeProfit)) ? "ns-resize" : "default";
        return;
      }
      const price = yToPrice(e.clientY);
      if (price == null) return;
      const line = dragging === "sl" ? slLineRef.current : tpLineRef.current;
      line?.applyOptions({ price });
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging) return;
      const side = dragging;
      dragging = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      el.style.cursor = "default";
      const price = yToPrice(e.clientY);
      if (price == null || price <= 0) return;
      if (side === "sl") cbRef.current.onMoveSL?.(price);
      else cbRef.current.onMoveTP?.(price);
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      cancelled = true;
      clearInterval(poll);
      ro.disconnect();
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      chart.remove();
      chartRef.current = null; seriesRef.current = null;
      entryLineRef.current = slLineRef.current = tpLineRef.current = null;
    };
  }, [asset, timeframe, height]);

  // Draw / update entry, SL, TP lines (no chart recreate)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const ref of [entryLineRef, slLineRef, tpLineRef]) {
      if (ref.current) { try { series.removePriceLine(ref.current); } catch { /* ignore */ } ref.current = null; }
    }
    const make = (price: number | undefined, color: string, title: string, style: LineStyle) =>
      price ? series.createPriceLine({ price, color, lineWidth: draggable ? 2 : 1, lineStyle: style, axisLabelVisible: true, title }) : null;

    entryLineRef.current = make(entryPrice, COL.entry, "Entry", LineStyle.Solid);
    slLineRef.current = make(stopLoss, COL.sl, draggable ? "SL ⇅" : "SL", LineStyle.Dashed);
    tpLineRef.current = make(takeProfit, COL.tp, draggable ? "TP ⇅" : "TP", LineStyle.Dashed);
  }, [entryPrice, stopLoss, takeProfit, draggable]);

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-ninja-border/60 bg-ninja-bg/60 text-xs">
        <span className="font-bold text-ninja-accent">{asset}</span>
        <span className="text-ninja-muted">{ASSETS[asset]?.name ?? asset} · Hyperliquid · native chart</span>
        {draggable && (stopLoss || takeProfit) && (
          <span className="ml-auto text-ninja-muted/80 hidden sm:block">drag SL / TP lines to adjust ⇅</span>
        )}
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
});
