import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "CryptoNinja — AI Leverage Trading",
  description: "AI-powered crypto leverage trading platform. Paper trading mode available. Trade BTC, ETH, HYPE, SOL with automated strategies.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ninja-bg text-ninja-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
