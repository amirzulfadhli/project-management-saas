import type { Config } from "tailwindcss";

const config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Spacing system (8px base)
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '24px',
        '6': '32px',
        '7': '40px',
        '8': '48px',
        '9': '64px',
        '10': '96px',
        '11': '128px',
      },
      // Border radius
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      // We'll define the font family later via @next/font
      fontFamily: {
        // Inter will be set in the layout
      },
      // Colors as CSS variables
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'primary-text': 'var(--color-text-primary)',
        'secondary-text': 'var(--color-text-secondary)',
        border: 'var(--color-border)',
        hover: 'var(--color-hover)',
        primary: 'var(--color-primary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        purple: 'var(--color-purple)',
        // We'll also define the dark mode colors via the same variables but overridden in dark mode
      },
    },
  },
  plugins: [],
  darkMode: 'class',
} satisfies Config;

export default config;
