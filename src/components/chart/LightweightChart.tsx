"use client";

import { useEffect, useRef, useState, memo } from "react";
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp,
} from "lightweight-charts";
import { ASSETS } from "@/types";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Crosshair } from "lucide-react";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

interface Props {
  asset: string;
  height?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  // Drag support: when true the SL/TP lines can be dragged; release fires the
  // matching callback with the new price so the caller updates the HL triggers.
  draggable?: boolean;
  onMoveSL?: (price: number) => void;
  onMoveTP?: (price: number) => void;
}

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;

export const LightweightChart = memo(function LightweightChart({
  asset, height = 520, entryPrice, stopLoss, takeProfit,
  draggable = false, onMoveSL, onMoveTP,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const lastBarRef = useRef<Bar | null>(null);
  // Live mirrors so the once-bound drag listeners stay current
  const pxRef = useRef({ entryPrice, stopLoss, takeProfit });
  pxRef.current = { entryPrice, stopLoss, takeProfit };
  const cbRef = useRef({ draggable, onMoveSL, onMoveTP });
  cbRef.current = { draggable, onMoveSL, onMoveTP };
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [loading, setLoading] = useState(true);
  // Shorter chart on phones so it doesn't dominate the screen
  const [chartH, setChartH] = useState(height);
  useEffect(() => {
    const calc = () => setChartH(window.innerWidth < 640 ? Math.min(height, 320) : height);
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [height]);
  const [empty, setEmpty] = useState(false);

  // Live last price from the store (updates ~every 30s via the market poll)
  const livePrice = useStore((s) => s.marketData[asset]?.price);

  // Sort ascending + dedupe by time (lightweight-charts requires strict order)
  const clean = (bars: Bar[]): Bar[] => {
    const sorted = bars
      .filter((b) => b && isFinite(b.time) && isFinite(b.close))
      .sort((a, b) => a.time - b.time);
    const out: Bar[] = [];
    for (const b of sorted) {
      if (out.length && out[out.length - 1].time === b.time) out[out.length - 1] = b;
      else out.push(b);
    }
    return out;
  };

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: "#050b06" }, textColor: "#4e7a5c", fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "#11301d" }, horzLines: { color: "#11301d" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#11301d" },
      timeScale: { borderColor: "#11301d", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#2bff88", downColor: "#ff4d5e",
      borderUpColor: "#2bff88", borderDownColor: "#ff4d5e",
      wickUpColor: "#2bff88", wickDownColor: "#ff4d5e",
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      color: "#11301d",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volSeriesRef.current = volSeries;

    const onResize = () => chart.applyOptions({ height });
    window.addEventListener("resize", onResize);

    // ── Drag SL / TP lines ────────────────────────────────────────────────
    let dragging: "sl" | "tp" | null = null;
    const HIT_PX = 7;
    const yToPrice = (clientY: number): number | null => {
      const r = el.getBoundingClientRect();
      const p = candleSeries.coordinateToPrice(clientY - r.top);
      return p == null ? null : (p as number);
    };
    const nearLine = (clientY: number, price?: number): boolean => {
      if (!price) return false;
      const coord = candleSeries.priceToCoordinate(price);
      if (coord == null) return false;
      const r = el.getBoundingClientRect();
      return Math.abs((clientY - r.top) - (coord as number)) <= HIT_PX;
    };
    const onDown = (e: MouseEvent) => {
      if (!cbRef.current.draggable) return;
      const { stopLoss, takeProfit } = pxRef.current;
      if (nearLine(e.clientY, stopLoss)) dragging = "sl";
      else if (nearLine(e.clientY, takeProfit)) dragging = "tp";
      else return;
      chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!cbRef.current.draggable) return;
      if (!dragging) {
        const { stopLoss, takeProfit } = pxRef.current;
        el.style.cursor = (nearLine(e.clientY, stopLoss) || nearLine(e.clientY, takeProfit)) ? "ns-resize" : "default";
        return;
      }
      const price = yToPrice(e.clientY);
      if (price == null) return;
      (dragging === "sl" ? slLineRef.current : tpLineRef.current)?.applyOptions({ price });
    };
    const onUp = (e: MouseEvent) => {
      if (!dragging) return;
      const side = dragging; dragging = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      el.style.cursor = "default";
      const price = yToPrice(e.clientY);
      if (price == null || price <= 0) return;
      if (side === "sl") cbRef.current.onMoveSL?.(price); else cbRef.current.onMoveTP?.(price);
    };
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("resize", onResize);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      priceLinesRef.current = [];
      slLineRef.current = null;
      tpLineRef.current = null;
    };
  }, [height]);

  // Apply responsive height changes (mobile ↔ desktop)
  useEffect(() => { chartRef.current?.applyOptions({ height: chartH }); }, [chartH]);

  // Load candles on asset / timeframe change, then poll for live updates
  useEffect(() => {
    let cancelled = false;

    const applyFull = (bars: Bar[]) => {
      const cleaned = clean(bars);
      if (cleaned.length === 0) { setEmpty(true); setLoading(false); return; }
      candleSeriesRef.current?.setData(
        cleaned.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
      );
      volSeriesRef.current?.setData(
        cleaned.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "#2bff8833" : "#ff4d5e33" }))
      );
      lastBarRef.current = cleaned[cleaned.length - 1];
      candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
      chartRef.current?.timeScale().fitContent();
      setEmpty(false);
      setLoading(false);
    };

    const fetchCandles = async (full: boolean) => {
      try {
        const res = await fetch(`/api/hl/candles?asset=${encodeURIComponent(asset)}&interval=${timeframe}&limit=${full ? 400 : 3}`);
        const data = await res.json();
        if (cancelled) return;
        const bars = (data.candles ?? []) as Bar[];
        if (full) { applyFull(bars); return; }
        // Incremental: update/append the latest couple of bars
        for (const b of clean(bars)) {
          candleSeriesRef.current?.update({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close });
          volSeriesRef.current?.update({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "#2bff8833" : "#ff4d5e33" });
          lastBarRef.current = b;
        }
      } catch {
        if (full && !cancelled) { setEmpty(true); setLoading(false); }
      }
    };

    setLoading(true);
    setEmpty(false);
    fetchCandles(true);
    // Poll for new bars: faster on low timeframes
    const pollMs = timeframe === "5m" || timeframe === "15m" ? 15000 : 30000;
    const id = setInterval(() => fetchCandles(false), pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [asset, timeframe]);

  // Smoothly update the forming candle's close from the live store price
  useEffect(() => {
    const series = candleSeriesRef.current;
    const last = lastBarRef.current;
    if (!series || !last || !livePrice) return;
    const updated: Bar = {
      ...last,
      close: livePrice,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
    };
    lastBarRef.current = updated;
    try {
      series.update({ time: updated.time as UTCTimestamp, open: updated.open, high: updated.high, low: updated.low, close: updated.close });
    } catch { /* ignore */ }
  }, [livePrice]);

  // Draw / update entry, SL, TP price lines reactively
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    // Remove old lines
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* ignore */ }
    }
    priceLinesRef.current = [];
    slLineRef.current = null;
    tpLineRef.current = null;

    const add = (price: number, color: string, title: string, style: LineStyle) => {
      const line = series.createPriceLine({
        price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title,
      });
      priceLinesRef.current.push(line);
      return line;
    };
    if (entryPrice) add(entryPrice, "#22d3ee", "Entry", LineStyle.Dotted);
    if (stopLoss) slLineRef.current = add(stopLoss, "#ff4d5e", draggable ? "SL ⇅" : "SL", LineStyle.Dashed);
    if (takeProfit) tpLineRef.current = add(takeProfit, "#2bff88", draggable ? "TP ⇅" : "TP", LineStyle.Dashed);
  }, [entryPrice, stopLoss, takeProfit, draggable, loading]);

  const cfg = ASSETS[asset];

  // Snap the view back to the latest candles + auto price scale (handy after
  // panning, or when a prior asset left the view at a different price level)
  const recenter = () => {
    candleSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
    chartRef.current?.timeScale().fitContent();
    chartRef.current?.timeScale().scrollToRealTime();
  };

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {/* Header: symbol + timeframe pills */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ninja-border/60">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color: cfg?.color }}>{asset}</span>
          <span className="text-ninja-muted text-xs">{cfg?.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={recenter}
            title="Recenter chart on latest price"
            className="flex items-center justify-center w-7 h-7 rounded-md bg-ninja-bg/50 text-ninja-muted hover:text-ninja-accent hover:bg-ninja-border/40 transition-all"
          >
            <Crosshair size={13} />
          </button>
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
      </div>

      <div className="relative">
        <div ref={containerRef} style={{ height: chartH }} />
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
