// Server-side Hyperliquid agent signing using a stored API wallet private key.
// The agent wallet is registered on HL by the user — it can sign orders on their
// behalf without requiring a wallet popup. The user's main wallet address must be
// passed as `vaultAddress` so HL knows which account to trade on.
//
// Set env var:  HL_AGENT_PRIVATE_KEY=0x<64 hex chars>

import { encode } from "@msgpack/msgpack";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HL_EXCHANGE = "https://api.hyperliquid.xyz/exchange";

export const HL_L1_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337, // Hyperliquid L1 chain
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;

const HL_AGENT_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

// Returns the viem account for the agent key, or null if not configured / invalid
export function getAgentAccount() {
  const pk = process.env.HL_AGENT_PRIVATE_KEY;
  if (!pk) return null;
  try {
    const key = pk.startsWith("0x") ? pk : `0x${pk}`;
    return privateKeyToAccount(key as `0x${string}`);
  } catch {
    return null;
  }
}

export function isAgentConfigured(): boolean {
  return getAgentAccount() !== null;
}

// Compute connectionId = keccak256(msgpack(action) + nonce_be8 + vault_bytes20)
function computeConnectionId(action: object, nonce: number, vaultAddress?: string): `0x${string}` {
  const packed = encode(action);

  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), false);

  const vaultBytes = vaultAddress
    ? (() => {
        const clean = vaultAddress.startsWith("0x") ? vaultAddress.slice(2) : vaultAddress;
        const b = new Uint8Array(20);
        for (let i = 0; i < 20; i++) b[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        return b;
      })()
    : new Uint8Array(20);

  const combined = new Uint8Array(packed.length + 8 + 20);
  combined.set(packed, 0);
  combined.set(nonceBytes, packed.length);
  combined.set(vaultBytes, packed.length + 8);

  return keccak256(combined);
}

// Sign an action server-side with the agent key and submit to Hyperliquid.
// `masterAddress` is the main wallet address (the account being traded on).
export async function submitWithAgent(
  action: object,
  masterAddress: string
): Promise<{ status: string; response?: any }> {
  const agent = getAgentAccount();
  if (!agent) throw new Error("HL_AGENT_PRIVATE_KEY not set");

  const nonce = Date.now();
  // When using an agent, vaultAddress in connectionId hash = master wallet
  const connectionId = computeConnectionId(action, nonce, masterAddress);

  const sig = await agent.signTypedData({
    domain: HL_L1_DOMAIN,
    types: HL_AGENT_TYPES,
    primaryType: "Agent",
    message: { source: "a", connectionId },
  });

  // Split 65-byte signature
  const raw = sig.slice(2);
  const signature = {
    r: `0x${raw.slice(0, 64)}` as `0x${string}`,
    s: `0x${raw.slice(64, 128)}` as `0x${string}`,
    v: parseInt(raw.slice(128, 130), 16),
  };

  const payload = {
    action,
    nonce,
    signature,
    vaultAddress: masterAddress.toLowerCase(), // required when agent != master
  };

  const res = await fetch(HL_EXCHANGE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data.status === "err") {
    throw new Error(data?.response ?? data?.error ?? "HL exchange error");
  }
  return data;
}
