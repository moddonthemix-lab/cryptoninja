/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    domains: ["assets.coingecko.com", "cryptologos.cc"],
  },
};

module.exports = nextConfig;
