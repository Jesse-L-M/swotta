import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        cream: {
          50: "#FAF6F0",
          100: "#F0ECE4",
          200: "#E5E0D6",
        },
        teal: {
          DEFAULT: "#2D7A6E",
          dark: "#256860",
          light: "#4DAFA0",
        },
        coral: {
          DEFAULT: "#D4654A",
          light: "#E8836A",
        },
        stone: {
          750: "#1A1917",
          650: "#5C5950",
          550: "#949085",
          450: "#A09B90",
        },
      },
    },
  },
  plugins: [],
};

export default config;
