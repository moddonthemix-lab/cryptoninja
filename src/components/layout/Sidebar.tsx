"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  History,
  Zap,
  AlertTriangle,
  PieChart,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/strategy", label: "Strategies", icon: Zap },
  { href: "/trades", label: "Trade History", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const { emergencyStop, triggerEmergencyStop, clearEmergencyStop } = useStore();

  return (
    <aside className="hidden lg:flex flex-col w-56 bg-ninja-card border-r border-ninja-border">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-ninja-border">
        <span className="text-xl">🥷</span>
        <span className="font-bold text-ninja-text">CryptoNinja</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-ninja-accent/20 text-ninja-accent border border-ninja-accent/30"
                : "text-ninja-muted hover:text-ninja-text hover:bg-ninja-border/50"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Emergency Stop */}
      <div className="p-3 border-t border-ninja-border">
        <button
          onClick={emergencyStop ? clearEmergencyStop : triggerEmergencyStop}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
            emergencyStop
              ? "bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30"
              : "bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
          )}
        >
          <AlertTriangle size={14} />
          {emergencyStop ? "Resume Trading" : "EMERGENCY STOP"}
        </button>
      </div>
    </aside>
  );
}
