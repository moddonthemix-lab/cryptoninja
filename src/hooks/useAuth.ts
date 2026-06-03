"use client";

import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useStore } from "@/store/useStore";
import { createSiweMessage } from "@/lib/siwe";
import { useCallback, useEffect } from "react";

export function useAuth() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { setAuth, clearAuth, isAuthenticated } = useStore();

  const signIn = useCallback(async () => {
    if (!address || !chainId) throw new Error("Wallet not connected");

    // Get nonce
    const nonceRes = await fetch("/api/auth/nonce");
    const { nonce } = await nonceRes.json();

    // Create SIWE message
    const message = createSiweMessage({
      address,
      chainId,
      nonce,
      domain: window.location.host,
      uri: window.location.origin,
    });

    // Sign
    const signature = await signMessageAsync({ message });

    // Verify — also send nonce so server can validate without session cookie
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature, nonce }),
    });

    if (!verifyRes.ok) throw new Error("Verification failed");

    setAuth(address, chainId);
  }, [address, chainId, signMessageAsync, setAuth]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearAuth();
    disconnect();
  }, [clearAuth, disconnect]);

  // Check session on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.isAuthenticated && data.address) {
          setAuth(data.address, data.chainId);
        }
      })
      .catch(() => {});
  }, [setAuth]);

  return { signIn, signOut, isAuthenticated, address, isConnected };
}
