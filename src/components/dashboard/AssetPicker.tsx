"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useStore } from "@/store/useStore";
import { ASSETS, ASSET_LIST } from "@/types";
import type { AssetCategory } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  crypto: "Crypto",
  stock: "Stocks",
  commodity: "Commodities",
};
const CATEGORY_ORDER: AssetCategory[] = ["crypto", "stock", "commodity"];

export function AssetPicker() {
  const { selectedAsset, setSelectedAsset, marketData } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return ASSET_LIST.filter((sym) => {
      if (!q) return true;
      const cfg = ASSETS[sym];
      return sym.includes(q) || cfg.name.toUpperCase().includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const g: Record<AssetCategory, string[]> = { crypto: [], stock: [], commodity: [] };
    filtered.forEach((sym) => g[ASSETS[sym].category].push(sym));
    return g;
  }, [filtered]);

  const cfg = ASSETS[selectedAsset];
  const selData = marketData[selectedAsset];
  const selUp = (selData?.changePercent24h ?? 0) >= 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border bg-ninja-card transition-all",
          open ? "border-ninja-accent" : "border-ninja-border hover:border-ninja-accent/50"
        )}
      >
        {/* Asset icon coin */}
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: `${cfg?.color}22`, color: cfg?.color }}
        >
          {cfg?.icon || selectedAsset[0]}
        </span>
        <div className="text-left leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-ninja-text">{selectedAsset}</span>
            <ChevronDown size={14} className={cn("text-ninja-muted transition-transform", open && "rotate-180")} />
          </div>
          <div className="text-ninja-muted text-[10px] hidden sm:block truncate max-w-[120px]">{cfg?.name}</div>
        </div>
        {selData && selData.price > 0 && (
          <div className="text-right leading-tight ml-1 pl-2 border-l border-ninja-border/60">
            <div className="font-mono font-bold text-xs text-ninja-text">
              ${selData.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: selData.price < 1 ? 6 : 2 })}
            </div>
            <div className={cn("text-[10px] font-mono", selUp ? "text-ninja-green" : "text-ninja-red")}>
              {selUp ? "+" : ""}{selData.changePercent24h.toFixed(2)}%
            </div>
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-80 max-h-[70vh] overflow-hidden flex flex-col bg-ninja-card border border-ninja-border rounded-xl shadow-2xl animate-scale-in origin-top-left">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-ninja-border/60">
            <Search size={14} className="text-ninja-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or name…"
              className="bg-transparent text-sm text-ninja-text placeholder-ninja-muted/60 outline-none flex-1"
            />
          </div>

          <div className="overflow-y-auto">
            {CATEGORY_ORDER.map((cat) =>
              grouped[cat].length === 0 ? null : (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ninja-muted/70 bg-ninja-bg/40 sticky top-0">
                    {CATEGORY_LABEL[cat]}
                  </div>
                  {grouped[cat].map((sym) => {
                    const c = ASSETS[sym];
                    const data = marketData[sym];
                    const up = (data?.changePercent24h ?? 0) >= 0;
                    const isSel = sym === selectedAsset;
                    return (
                      <button
                        key={sym}
                        onClick={() => { setSelectedAsset(sym); setOpen(false); setQuery(""); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ninja-border/30 transition-colors",
                          isSel && "bg-ninja-accent/10"
                        )}
                      >
                        <span className="font-bold text-sm w-16 flex-shrink-0" style={{ color: c.color }}>{sym}</span>
                        <span className="text-ninja-muted text-xs truncate flex-1">{c.name}</span>
                        {data && data.price > 0 && (
                          <span className="text-right flex-shrink-0">
                            <span className="text-ninja-text text-xs font-mono block">
                              ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: data.price < 1 ? 6 : 2 })}
                            </span>
                            <span className={cn("text-xs font-mono", up ? "text-ninja-green" : "text-ninja-red")}>
                              {up ? "+" : ""}{data.changePercent24h.toFixed(2)}%
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-ninja-muted text-xs">No tickers match “{query}”</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
