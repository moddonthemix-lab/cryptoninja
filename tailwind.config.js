/** @type {import('tailwindcss').Config} */
const config = {
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
          bg: "#000000",
          card: "#050b06",
          border: "#11301d",
          accent: "#00ff66",
          "accent-hover": "#00e65c",
          green: "#2bff88",
          red: "#ff4d5e",
          yellow: "#ffcb45",
          text: "#d7ffe0",
          muted: "#4e7a5c",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
        "fade-in": "fadeIn .3s ease-out both",
        "slide-up": "slideUp .35s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scaleIn .18s cubic-bezier(0.16,1,0.3,1) both",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        scaleIn: { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
      },
    },
  },
  plugins: [],
};

module.exports = config;
