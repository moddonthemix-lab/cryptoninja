"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useWalletWatcher } from "@/hooks/useWalletWatcher";
import { cn } from "@/lib/utils";
import { ASSETS } from "@/types";
import { Bell, X, Copy as CopyIcon, TrendingUp, TrendingDown } from "lucide-react";

// Runs the background tracked-wallet watcher (mount once, e.g. in the layout)
export function WalletWatcherRunner() {
  useWalletWatcher();
  return null;
}

const ago = (ms: number) => {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

export function NotificationsBell() {
  const { notifications, dismissNotification, clearNotifications, setCopyTrade, copyTrade } = useStore();
  const [open, setOpen] = useState(false);

  const copyFromNotif = (n: typeof notifications[number]) => {
    const ct = useStore.getState().copyTrade;
    const sameWallet = ct.targetAddress.toLowerCase() === n.address.toLowerCase();
    if (sameWallet && ct.enabled) {
      // already on this wallet → ensure this symbol is included
      const filter = ct.assetFilter.length === 0 ? [] : Array.from(new Set([...ct.assetFilter, n.sym]));
      setCopyTrade({ assetFilter: filter });
    } else {
      setCopyTrade({ targetAddress: n.address, enabled: true, assetFilter: [n.sym] });
    }
    dismissNotification(n.id);
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/40 transition-colors"
        title="Tracked-wallet alerts"
      >
        <Bell size={16} />
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-ninja-accent text-white text-[9px] font-bold flex items-center justify-center">
            {notifications.length > 99 ? "99+" : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto bg-ninja-card border border-ninja-border rounded-xl shadow-2xl z-50 animate-fade-in">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ninja-border/60 sticky top-0 bg-ninja-card">
              <span className="text-xs font-bold text-ninja-text">Wallet Alerts</span>
              {notifications.length > 0 && (
                <button onClick={clearNotifications} className="text-[11px] text-ninja-muted hover:text-ninja-accent">Clear all</button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-ninja-muted text-xs">
                No alerts yet. Track wallets to get notified when they open or close positions.
              </div>
            ) : (
              <div className="divide-y divide-ninja-border/40">
                {notifications.map((n) => {
                  const isOpen = n.kind === "open";
                  const isLong = n.direction === "long";
                  const copying = copyTrade.enabled
                    && copyTrade.targetAddress.toLowerCase() === n.address.toLowerCase()
                    && (copyTrade.assetFilter.length === 0 || copyTrade.assetFilter.includes(n.sym));
                  return (
                    <div key={n.id} className="px-3 py-2.5 flex items-start gap-2 hover:bg-ninja-border/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={cn("font-bold px-1 py-0.5 rounded text-[10px]", isOpen ? "bg-ninja-accent/20 text-ninja-accent" : "bg-ninja-border text-ninja-muted")}>
                            {isOpen ? "OPENED" : "CLOSED"}
                          </span>
                          <span className="text-ninja-muted truncate">{n.label}</span>
                          <span className="text-ninja-muted/50 ml-auto flex-shrink-0">{ago(n.time)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-xs">
                          {isOpen && (isLong ? <TrendingUp size={12} className="text-ninja-green" /> : <TrendingDown size={12} className="text-ninja-red" />)}
                          <span className="font-bold font-mono" style={{ color: ASSETS[n.sym]?.color }}>{n.sym}</span>
                          {isOpen && (
                            <>
                              <span className={cn("font-bold", isLong ? "text-ninja-green" : "text-ninja-red")}>{n.direction.toUpperCase()}</span>
                              <span className="text-ninja-muted">{n.leverage}x · ${n.entryPx.toFixed(n.entryPx < 1 ? 5 : 2)}</span>
                            </>
                          )}
                        </div>
                        {isOpen && (
                          <button
                            onClick={() => copyFromNotif(n)}
                            disabled={!n.tradable || copying}
                            className={cn(
                              "mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold transition-all",
                              copying ? "bg-ninja-accent/15 text-ninja-accent cursor-default"
                                : !n.tradable ? "bg-ninja-border/40 text-ninja-muted/50 cursor-not-allowed"
                                : "bg-ninja-accent text-white hover:bg-ninja-accent-hover"
                            )}
                          >
                            <CopyIcon size={10} /> {copying ? "Copying" : n.tradable ? "Copy this trade" : "Not tradable"}
                          </button>
                        )}
                      </div>
                      <button onClick={() => dismissNotification(n.id)} className="text-ninja-muted hover:text-red-400 flex-shrink-0 mt-0.5" title="Dismiss">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
