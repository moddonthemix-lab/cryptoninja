import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ninja: {
          bg: "#0a0a0f",
          card: "#12121a",
          border: "#1e1e2e",
          accent: "#7c3aed",
          "accent-hover": "#6d28d9",
          green: "#10b981",
          red: "#ef4444",
          yellow: "#f59e0b",
          text: "#e2e8f0",
          muted: "#64748b",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
