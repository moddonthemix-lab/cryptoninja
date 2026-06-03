// Server-side Hyperliquid agent signing using a stored API wallet private key.
// The agent (API) wallet is registered on HL by the user. It signs orders on the
// user's behalf with no wallet popup. Hyperliquid recovers the agent address from
// the signature and looks up which master account it belongs to.
//
// Set env var:  HL_AGENT_PRIVATE_KEY=0x<64 hex chars>
//
// Signing follows the official Hyperliquid Python SDK exactly:
//   action_hash = keccak( msgpack(action) + nonce_be8 + vaultByte [+ expiresAfter] )
//     vaultByte = 0x00            when no vault (agent wallet case)
//     vaultByte = 0x01 + addr20   when trading a vault
//   phantomAgent = { source: "a" (mainnet) | "b" (testnet), connectionId: action_hash }
//   signature = EIP-712 sign of phantomAgent over the Exchange domain (chainId 1337)

import { encode } from "@msgpack/msgpack";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const HL_EXCHANGE = "https://api.hyperliquid.xyz/exchange";

export const HL_L1_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337, // Hyperliquid L1 signing chain (NOT Arbitrum)
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
    const clean = pk.replace(/\s+/g, ""); // strip whitespace/newlines
    const key = clean.startsWith("0x") ? clean : `0x${clean}`;
    return privateKeyToAccount(key as `0x${string}`);
  } catch {
    return null;
  }
}

export function isAgentConfigured(): boolean {
  return getAgentAccount() !== null;
}

// Compute the L1 action hash exactly as the Hyperliquid SDK does.
// For agent wallets there is no vault, so we append a single 0x00 byte.
function actionHash(action: object, nonce: number, vaultAddress?: string | null): `0x${string}` {
  const packed = new Uint8Array(encode(action));

  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), false); // big-endian

  let tail: Uint8Array;
  if (vaultAddress) {
    const clean = vaultAddress.startsWith("0x") ? vaultAddress.slice(2) : vaultAddress;
    const addr = new Uint8Array(20);
    for (let i = 0; i < 20; i++) addr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    tail = new Uint8Array(1 + 20);
    tail[0] = 0x01;
    tail.set(addr, 1);
  } else {
    tail = new Uint8Array([0x00]); // no vault
  }

  const combined = new Uint8Array(packed.length + nonceBytes.length + tail.length);
  combined.set(packed, 0);
  combined.set(nonceBytes, packed.length);
  combined.set(tail, packed.length + nonceBytes.length);

  return keccak256(combined);
}

// Sign an action server-side with the agent key and submit to Hyperliquid.
export async function submitWithAgent(
  action: object,
  _masterAddress?: string // kept for signature-compat; agent wallets don't use vault
): Promise<{ status: string; response?: any }> {
  const agent = getAgentAccount();
  if (!agent) throw new Error("HL_AGENT_PRIVATE_KEY not set");

  const nonce = Date.now();
  // Agent wallet → no vault → vaultByte is 0x00
  const connectionId = actionHash(action, nonce, null);

  const sig = await agent.signTypedData({
    domain: HL_L1_DOMAIN,
    types: HL_AGENT_TYPES,
    primaryType: "Agent",
    message: { source: "a", connectionId }, // "a" = mainnet
  });

  // Split 65-byte signature into r, s, v
  const raw = sig.slice(2);
  const signature = {
    r: `0x${raw.slice(0, 64)}` as `0x${string}`,
    s: `0x${raw.slice(64, 128)}` as `0x${string}`,
    v: parseInt(raw.slice(128, 130), 16),
  };

  // Agent wallets do NOT send vaultAddress — HL maps agent → master automatically
  const payload = { action, nonce, signature };

  const res = await fetch(HL_EXCHANGE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.response ?? data?.error ?? `HL HTTP ${res.status}`);
  }
  // HL returns { status: "ok" | "err", response: ... }
  if (data.status === "err") {
    throw new Error(typeof data.response === "string" ? data.response : JSON.stringify(data.response));
  }
  // Even with status "ok", individual orders can fail — surface that
  const statuses = data?.response?.data?.statuses;
  if (Array.isArray(statuses)) {
    const err = statuses.find((s: any) => s?.error);
    if (err) throw new Error(err.error);
  }
  return data;
}
