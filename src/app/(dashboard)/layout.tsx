"use client";

import { useStore } from "@/store/useStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CopyTraderRunner } from "@/components/dashboard/CopyTrading";
import { WalletWatcherRunner } from "@/components/layout/NotificationsBell";
import { MarketTicker } from "@/components/dashboard/MarketTicker";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { emergencyStop } = useStore();

  return (
    <div className="flex h-screen bg-ninja-bg overflow-hidden">
      {/* Market data, copy engine + wallet watcher run across all pages */}
      <MarketTicker />
      <CopyTraderRunner />
      <WalletWatcherRunner />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        {emergencyStop && (
          <div className="bg-red-900/80 border-b border-red-500 px-4 py-2 text-red-200 text-sm flex items-center justify-between">
            <span className="font-bold">⚠️ EMERGENCY STOP ACTIVE — All automated trading halted</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
