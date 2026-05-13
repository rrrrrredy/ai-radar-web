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
          ink: "#111827",
          muted: "#5f6b7a",
          line: "#d8dee8",
          panel: "#f7f9fc",
          cyan: "#0f766e",
          amber: "#b45309",
          rose: "#be123c"
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
