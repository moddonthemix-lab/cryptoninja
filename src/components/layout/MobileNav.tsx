"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import { Menu, X, AlertTriangle } from "lucide-react";
import { navItems } from "./Sidebar";

// Hamburger + slide-in drawer for phones (the full sidebar is hidden < lg).
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { emergencyStop, triggerEmergencyStop, clearEmergencyStop } = useStore();

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="p-2 -ml-1 rounded-lg text-ninja-text hover:bg-ninja-border/40"
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 max-w-[80vw] bg-ninja-card border-r border-ninja-border flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between px-4 py-4 border-b border-ninja-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">🥷</span>
                <span className="font-bold text-ninja-text">CryptoNinja</span>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-ninja-muted hover:text-ninja-text">
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all",
                    pathname === href || pathname.startsWith(href + "/")
                      ? "bg-ninja-accent/20 text-ninja-accent border border-ninja-accent/30"
                      : "text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/50"
                  )}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </nav>

            <div className="p-3 border-t border-ninja-border">
              <button
                onClick={() => { (emergencyStop ? clearEmergencyStop : triggerEmergencyStop)(); setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                  emergencyStop
                    ? "bg-green-600/20 text-green-400 border border-green-500/30"
                    : "bg-red-600/20 text-red-400 border border-red-500/30"
                )}
              >
                <AlertTriangle size={14} />
                {emergencyStop ? "Resume Trading" : "EMERGENCY STOP"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
