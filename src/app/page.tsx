"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useStore } from "@/store/useStore";
import { LandingPage } from "@/components/landing/LandingPage";

export default function Home() {
  const { isConnected } = useAccount();
  const { isAuthenticated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (isConnected && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isConnected, isAuthenticated, router]);

  return <LandingPage />;
}
