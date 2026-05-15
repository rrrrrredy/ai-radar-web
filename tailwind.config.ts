import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          bg: "rgb(var(--radar-bg) / <alpha-value>)",
          ink: "rgb(var(--radar-ink) / <alpha-value>)",
          muted: "rgb(var(--radar-muted) / <alpha-value>)",
          line: "rgb(var(--radar-line) / <alpha-value>)",
          panel: "rgb(var(--radar-panel) / <alpha-value>)",
          surface: "rgb(var(--radar-surface) / <alpha-value>)",
          evidence: "rgb(var(--radar-evidence) / <alpha-value>)",
          freshness: "rgb(var(--radar-freshness) / <alpha-value>)",
          caution: "rgb(var(--radar-caution) / <alpha-value>)",
          risk: "rgb(var(--radar-risk) / <alpha-value>)",
          success: "rgb(var(--radar-success) / <alpha-value>)",
          admin: "rgb(var(--radar-admin) / <alpha-value>)",
          code: "rgb(var(--radar-code) / <alpha-value>)",
          cyan: "rgb(var(--radar-evidence) / <alpha-value>)",
          amber: "rgb(var(--radar-caution) / <alpha-value>)",
          rose: "rgb(var(--radar-risk) / <alpha-value>)"
        }
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
