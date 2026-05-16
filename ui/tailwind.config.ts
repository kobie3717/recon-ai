import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        recon: {
          dark:  '#0A0E1A',
          navy:  '#0F172A',
          blue:  '#2563EB',
          cyan:  '#06B6D4',
          green: '#10B981',
          amber: '#F59E0B',
          red:   '#EF4444',
          grey:  '#64748B',
          light: '#F8FAFC',
        }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;
