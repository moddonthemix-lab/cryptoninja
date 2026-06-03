"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { useHyperliquid } from "@/hooks/useHyperliquid";
import { cn } from "@/lib/utils";
import { ASSETS } from "@/types";
import type { Asset } from "@/types";
import { AlertTriangle, TrendingUp, TrendingDown, Zap, Shield } from "lucide-react";

export function TradingPanel() {
  const { selectedAsset, marketData, tradingMode, aiSignals, setChartOverlay } = useStore();
  const { placeOrder, setLeverage, setTpSl, loading, error, isLive } = useHyperliquid();

  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [size, setSizeStr] = useState("0.001");
  const [leverage, setLevHandle] = useState(3);
  const [slPct, setSlPct] = useState(1.5);
  const [tpPct, setTpPct] = useState(3);
  const [useSl, setUseSl] = useState(true);
  const [useTp, setUseTp] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [hlMeta, setHlMeta] = useState<Record<string, any>>({});

  const currentPrice = marketData[selectedAsset]?.price;
  const aiSignal = aiSignals[selectedAsset];

  useEffect(() => {
    if (currentPrice && orderType === "market") {
      setPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice, orderType]);

  useEffect(() => {
    fetch("/api/hl/meta")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setHlMeta(d); })
      .catch(() => {});
  }, []);

  // Apply AI signal
  const applyAISignal = () => {
    if (!aiSignal) return;
    setSide(aiSignal.direction === "long" ? "long" : "short");
    if (aiSignal.suggestedEntry) setPrice(aiSignal.suggestedEntry.toFixed(2));
    if (aiSignal.suggestedSL && aiSignal.suggestedEntry) {
      const slPct_ = Math.abs(
        ((aiSignal.suggestedSL - aiSignal.suggestedEntry) / aiSignal.suggestedEntry) * 100
      );
      setSlPct(parseFloat(slPct_.toFixed(2)));
    }
    if (aiSignal.suggestedTP && aiSignal.suggestedEntry) {
      const tpPct_ = Math.abs(
        ((aiSignal.suggestedTP - aiSignal.suggestedEntry) / aiSignal.suggestedEntry) * 100
      );
      setTpPct(parseFloat(tpPct_.toFixed(2)));
    }
    if (aiSignal.suggestedLeverage) setLevHandle(aiSignal.suggestedLeverage);
  };

  const entryPrice = parseFloat(price) || currentPrice || 0;
  const sz = parseFloat(size) || 0;
  const slPrice = side === "long"
    ? entryPrice * (1 - slPct / 100)
    : entryPrice * (1 + slPct / 100);
  const tpPrice = side === "long"
    ? entryPrice * (1 + tpPct / 100)
    : entryPrice * (1 - tpPct / 100);

  const notional = entryPrice * sz;
  const margin = notional / leverage;
  const maxLev = hlMeta[selectedAsset]?.maxLeverage ?? 50;

  // Mirror the ticket onto the chart as you compose it (and clear on unmount)
  useEffect(() => {
    if (!entryPrice) return;
    setChartOverlay({
      asset: selectedAsset,
      entry: entryPrice,
      sl: useSl && slPct > 0 ? slPrice : null,
      tp: useTp && tpPct > 0 ? tpPrice : null,
    });
  }, [selectedAsset, entryPrice, slPrice, tpPrice, useSl, useTp, slPct, tpPct, setChartOverlay]);

  useEffect(() => () => setChartOverlay(null), [setChartOverlay]);

  const handleSubmit = async () => {
    if (!entryPrice || !sz) return;

    setStatus(null);
    try {
      // Set leverage first
      await setLeverage(selectedAsset, leverage, true);

      // Place order
      const result = await placeOrder({
        asset: selectedAsset,
        isBuy: side === "long",
        price: orderType === "market" ? entryPrice * (side === "long" ? 1.01 : 0.99) : entryPrice,
        size: sz,
        tif: orderType === "market" ? "Ioc" : "Gtc",
      });

      // Attach TP / SL trigger orders if enabled
      if ((useTp && tpPct > 0) || (useSl && slPct > 0)) {
        try {
          await setTpSl({
            asset: selectedAsset,
            positionIsLong: side === "long",
            size: sz,
            takeProfit: useTp && tpPct > 0 ? tpPrice : null,
            stopLoss: useSl && slPct > 0 ? slPrice : null,
          });
          setStatus(`✅ Order placed with ${useTp ? "TP" : ""}${useTp && useSl ? " + " : ""}${useSl ? "SL" : ""}!`);
        } catch (tpErr: any) {
          setStatus(`⚠️ Order filled but TP/SL failed: ${tpErr.message}`);
        }
      } else if (result.status === "ok") {
        setStatus(`✅ Order placed! ID: ${result.oid ?? "confirmed"}`);
      }
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  };

  return (
    <div className="bg-ninja-card border border-ninja-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-ninja-accent" />
          <span className="font-bold text-sm text-ninja-text">Trade</span>
          <span className="font-bold text-sm" style={{ color: ASSETS[selectedAsset].color }}>
            {selectedAsset}
          </span>
        </div>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full font-bold",
          tradingMode === "paper"
            ? "bg-yellow-500/20 text-yellow-400"
            : "bg-green-500/20 text-green-400"
        )}>
          {tradingMode.toUpperCase()}
        </span>
      </div>

      {tradingMode === "paper" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
          📄 Paper mode — switch to Live in the top bar to trade real funds via Hyperliquid
        </div>
      )}

      {tradingMode === "live" && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2 text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          Real funds — orders execute on Hyperliquid perps. Only risk what you can afford to lose.
        </div>
      )}

      <div className="space-y-3">
          {/* AI Signal quick-fill */}
          {aiSignal && (
            <button
              onClick={applyAISignal}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-ninja-accent/30 bg-ninja-accent/5 hover:bg-ninja-accent/10 transition-all text-xs text-ninja-accent"
            >
              <Zap size={11} />
              Apply AI Signal — {aiSignal.direction.toUpperCase()} {aiSignal.confidence}% conf
            </button>
          )}

          {/* Long / Short */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("long")}
              className={cn(
                "py-2.5 rounded-xl font-bold text-sm transition-all border flex items-center justify-center gap-1.5",
                side === "long"
                  ? "bg-ninja-green/20 border-ninja-green text-ninja-green"
                  : "border-ninja-border text-ninja-muted hover:border-ninja-green/50"
              )}
            >
              <TrendingUp size={14} /> Long
            </button>
            <button
              onClick={() => setSide("short")}
              className={cn(
                "py-2.5 rounded-xl font-bold text-sm transition-all border flex items-center justify-center gap-1.5",
                side === "short"
                  ? "bg-ninja-red/20 border-ninja-red text-ninja-red"
                  : "border-ninja-border text-ninja-muted hover:border-ninja-red/50"
              )}
            >
              <TrendingDown size={14} /> Short
            </button>
          </div>

          {/* Order type */}
          <div className="flex gap-1">
            {(["limit", "market"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "flex-1 py-1.5 rounded text-xs font-bold capitalize transition-all border",
                  orderType === t
                    ? "bg-ninja-accent/20 border-ninja-accent/50 text-ninja-accent"
                    : "border-ninja-border text-ninja-muted"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Price */}
          {orderType === "limit" && (
            <div>
              <label className="label">Limit Price (USDC)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice?.toFixed(2) ?? "0.00"}
                className="input"
              />
            </div>
          )}

          {/* Size */}
          <div>
            <label className="label">Size ({selectedAsset})</label>
            <input
              type="number"
              value={size}
              onChange={(e) => setSizeStr(e.target.value)}
              step="0.001"
              className="input"
            />
          </div>

          {/* Leverage */}
          <div>
            <label className="label">Leverage: {leverage}x (max {maxLev}x)</label>
            <input
              type="range"
              min={1}
              max={Math.min(maxLev, 50)}
              step={1}
              value={leverage}
              onChange={(e) => setLevHandle(parseInt(e.target.value))}
              className="w-full accent-ninja-accent"
            />
            <div className="flex justify-between text-xs text-ninja-muted mt-0.5">
              <span>1x</span>
              <span className={cn(
                leverage > 20 ? "text-red-400" : leverage > 10 ? "text-yellow-400" : "text-ninja-green"
              )}>
                {leverage}x {leverage > 20 ? "⚠️ Very High" : leverage > 10 ? "High" : "Moderate"}
              </span>
              <span>{Math.min(maxLev, 50)}x</span>
            </div>
          </div>

          {/* SL / TP with on/off toggles */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-ninja-red flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={useSl} onChange={(e) => setUseSl(e.target.checked)} className="accent-ninja-red" />
                Stop Loss %
              </label>
              <input
                type="number"
                value={slPct}
                onChange={(e) => setSlPct(parseFloat(e.target.value))}
                step="0.1"
                disabled={!useSl}
                className={cn("input", !useSl && "opacity-40")}
              />
            </div>
            <div>
              <label className="label text-ninja-green flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={useTp} onChange={(e) => setUseTp(e.target.checked)} className="accent-ninja-green" />
                Take Profit %
              </label>
              <input
                type="number"
                value={tpPct}
                onChange={(e) => setTpPct(parseFloat(e.target.value))}
                step="0.1"
                disabled={!useTp}
                className={cn("input", !useTp && "opacity-40")}
              />
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-ninja-border/20 rounded-xl p-3 text-xs space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-ninja-muted">Notional</span>
              <span>${notional.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ninja-muted">Margin</span>
              <span>${margin.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ninja-muted">Stop Loss</span>
              <span className="text-ninja-red">${slPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ninja-muted">Take Profit</span>
              <span className="text-ninja-green">${tpPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ninja-muted">R:R</span>
              <span className={cn(tpPct / slPct >= 2 ? "text-ninja-green" : "text-yellow-400")}>
                1:{(tpPct / slPct).toFixed(1)}
              </span>
            </div>
          </div>

          {/* Status */}
          {(error || status) && (
            <div className={cn(
              "text-xs p-3 rounded-lg border",
              error
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-green-500/10 border-green-500/30 text-green-400"
            )}>
              {error || status}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={tradingMode === "live" ? handleSubmit : undefined}
            disabled={loading || (tradingMode === "live" && (!entryPrice || !sz))}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              tradingMode === "paper"
                ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 cursor-not-allowed"
                : side === "long"
                ? "bg-ninja-green/20 border border-ninja-green text-ninja-green hover:bg-ninja-green/30"
                : "bg-ninja-red/20 border border-ninja-red text-ninja-red hover:bg-ninja-red/30",
              loading && "opacity-60"
            )}
          >
            {loading ? (
              "Signing..."
            ) : tradingMode === "paper" ? (
              <><Shield size={14} /> Paper Mode — Enable Live to Trade</>
            ) : (
              <>{side === "long" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {side === "long" ? "Long" : "Short"} {selectedAsset} {leverage}x</>
            )}
          </button>
        </div>
    </div>
  );
}
