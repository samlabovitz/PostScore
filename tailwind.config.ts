import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // matches the prototype's own sidebar/drawer breakpoint
        nav: "860px",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
          mute: "var(--color-ink-mute)",
        },
        brass: "var(--color-brass)",
        green: "var(--color-green)",
        red: "var(--color-red)",
        amber: "var(--color-amber)",
        paper: {
          DEFAULT: "var(--color-paper)",
          deep: "var(--color-paper-deep)",
          line: "var(--color-paper-line)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Arial", "Helvetica", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 14px 34px -26px rgba(20, 36, 63, 0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
