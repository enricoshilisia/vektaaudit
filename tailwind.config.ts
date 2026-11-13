import type { Config } from "tailwindcss";

// VektaAudit palette: navy shell, one corporate blue, status colours reserved for state
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0B1F33", 900: "#16324F", 800: "#1E3A58", 700: "#24456A", 600: "#2C4A6B", 300: "#8FA3B8", 200: "#C9D4E0" },
        brand: { 50: "#F4F8FD", 100: "#E8F0FB", 200: "#D6E4F5", 300: "#A9C4E8", 600: "#1F5FAE", 700: "#174A88", 800: "#1A4F91" },
        ink: { DEFAULT: "#14212E", 700: "#3D4C5C", 500: "#5A6B7D", 400: "#7A8A9C", 300: "#A7B4C2" },
        line: { DEFAULT: "#E2E7ED", soft: "#EEF1F4", strong: "#D3DAE2" },
        canvas: "#F4F6F8",
        high: { bg: "#FDECEA", fg: "#912018", dot: "#B42318" },
        med: { bg: "#FEF3E2", fg: "#93370D", dot: "#DC6803" },
        ok: { bg: "#E6F4EF", fg: "#0F5E4B", dot: "#12715B" },
        violet: { bg: "#F1EBFA", fg: "#4A2F80" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
