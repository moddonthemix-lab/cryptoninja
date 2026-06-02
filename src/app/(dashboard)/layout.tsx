"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected } = useAccount();
  const { isAuthenticated, emergencyStop } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected || !isAuthenticated) {
      router.push("/");
    }
  }, [isConnected, isAuthenticated, router]);

  if (!isConnected || !isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-ninja-bg overflow-hidden">
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
