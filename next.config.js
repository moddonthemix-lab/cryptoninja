/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    domains: ["assets.coingecko.com", "cryptologos.cc"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
              "frame-src https://*.tradingview.com https://s3.tradingview.com",
              "connect-src 'self' https://*.tradingview.com wss://*.tradingview.com https://api.binance.com wss://stream.binance.com https://api.coingecko.com https://api.hyperliquid.xyz wss://api.hyperliquid.xyz",
              "img-src 'self' data: blob: https://*.tradingview.com https://assets.coingecko.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.tradingview.com",
              "font-src 'self' https://fonts.gstatic.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
