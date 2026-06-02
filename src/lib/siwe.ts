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
    expirationTime: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // 5 min
  });
  return message.prepareMessage();
}

export async function verifySiweMessage(message: string, signature: string) {
  const siweMessage = new SiweMessage(message);
  const result = await siweMessage.verify({ signature });
  return result;
}
