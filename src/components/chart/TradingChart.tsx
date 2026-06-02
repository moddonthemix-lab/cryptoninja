"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
  LineStyle,
} from "lightweight-charts";
import type { Asset, Candle, ChartLine } from "@/types";
import { ASSETS } from "@/types";

interface TradingChartProps {
  asset: Asset;
  candles: Candle[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  currentPrice?: number;
  height?: number;
}

export function TradingChart({
  asset,
  candles,
  entryPrice,
  stopLoss,
  takeProfit,
  currentPrice,
  height = 400,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#12121a" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#7c3aed", labelBackgroundColor: "#7c3aed" },
        horzLine: { color: "#7c3aed", labelBackgroundColor: "#7c3aed" },
      },
      rightPriceScale: {
        borderColor: "#1e1e2e",
      },
      timeScale: {
        borderColor: "#1e1e2e",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    if (candles.length > 0) {
      const sorted = [...candles].sort((a, b) => a.time - b.time);
      candleSeries.setData(
        sorted.map((c) => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Price lines
    if (entryPrice) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: "#7c3aed",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "ENTRY",
      });
    }

    if (stopLoss) {
      candleSeries.createPriceLine({
        price: stopLoss,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "STOP LOSS",
      });
    }

    if (takeProfit) {
      candleSeries.createPriceLine({
        price: takeProfit,
        color: "#10b981",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TAKE PROFIT",
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [candles, entryPrice, stopLoss, takeProfit, height]);

  return (
    <div className="bg-ninja-card rounded-xl overflow-hidden border border-ninja-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ninja-border">
        <div className="flex items-center gap-3">
          <span
            className="font-bold text-sm"
            style={{ color: ASSETS[asset].color }}
          >
            {asset}/USDT
          </span>
          {currentPrice && (
            <span className="text-ninja-text font-mono text-sm">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          {entryPrice && (
            <span className="text-ninja-accent">
              Entry: ${entryPrice.toFixed(2)}
            </span>
          )}
          {stopLoss && (
            <span className="text-ninja-red">
              SL: ${stopLoss.toFixed(2)}
            </span>
          )}
          {takeProfit && (
            <span className="text-ninja-green">
              TP: ${takeProfit.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
