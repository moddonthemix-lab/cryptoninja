"use client";

import { encode } from "@msgpack/msgpack";
import { keccak256 } from "viem";

// Hyperliquid mainnet EIP-712 domain for L1 actions (chainId 1337 = HL chain)
export const HL_L1_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;

export const HL_AGENT_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

// Compute the connectionId = keccak256(msgpack(action) + nonce_be8 + vault_bytes20)
export function computeConnectionId(
  action: object,
  nonce: number,
  vaultAddress?: string
): `0x${string}` {
  const packed = encode(action);

  const nonceBytes = new Uint8Array(8);
  const view = new DataView(nonceBytes.buffer);
  view.setBigUint64(0, BigInt(nonce), false); // big-endian

  const vaultBytes = vaultAddress
    ? hexToBytes20(vaultAddress)
    : new Uint8Array(20);

  const combined = new Uint8Array(packed.length + 8 + 20);
  combined.set(packed, 0);
  combined.set(nonceBytes, packed.length);
  combined.set(vaultBytes, packed.length + 8);

  return keccak256(combined);
}

function hexToBytes20(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Build the phantom agent value to sign
export function buildPhantomAgent(connectionId: `0x${string}`) {
  return {
    source: "a", // "a" = mainnet
    connectionId,
  };
}

// Split a 65-byte hex signature into { r, s, v }
export function splitSignature(sig: `0x${string}`) {
  const raw = sig.slice(2);
  const r = `0x${raw.slice(0, 64)}` as `0x${string}`;
  const s = `0x${raw.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(raw.slice(128, 130), 16);
  return { r, s, v };
}
