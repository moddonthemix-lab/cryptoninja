import { SiweMessage } from "siwe";

export function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function createSiweMessage(params: {
  address: string;
  chainId: number;
  nonce: string;
  domain: string;
  uri: string;
}): string {
  const message = new SiweMessage({
    domain: params.domain,
    address: params.address,
    statement: "Sign in to CryptoNinja — your AI-powered leverage trading platform. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri: params.uri,
    version: "1",
    chainId: params.chainId,
    nonce: params.nonce,
    issuedAt: new Date().toISOString(),
    // No expiration — avoids failures from clock skew or slow signing
  });
  return message.prepareMessage();
}
