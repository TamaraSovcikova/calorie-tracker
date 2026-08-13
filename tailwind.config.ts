import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        kcal: 'hsl(var(--kcal))',
        protein: 'hsl(var(--protein))',
        carbs: 'hsl(var(--carbs))',
        fat: 'hsl(var(--fat))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Must lead with Hanken Grotesk to match `body` in index.css. Without
      // it, anything using Tailwind's `font-sans` utility silently fell back
      // to system UI while the rest of the app rendered in the real typeface.
      fontFamily: {
        sans: [
          'Hanken Grotesk',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      // Soft, diffuse, slate-tinted elevation — minimalist depth.
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sm: '0 1px 3px 0 rgb(15 23 42 / 0.05), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        DEFAULT: '0 2px 8px -2px rgb(15 23 42 / 0.07), 0 2px 4px -3px rgb(15 23 42 / 0.05)',
        md: '0 4px 14px -3px rgb(15 23 42 / 0.08), 0 2px 6px -4px rgb(15 23 42 / 0.05)',
        lg: '0 10px 26px -6px rgb(15 23 42 / 0.10), 0 4px 10px -6px rgb(15 23 42 / 0.06)',
        xl: '0 18px 38px -10px rgb(15 23 42 / 0.13)',
        '2xl': '0 26px 52px -14px rgb(15 23 42 / 0.20)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        // The dog's calm idle — a clearly visible float + breath.
        breathe: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-4%) scale(1.045)' },
        },
        // A livelier bounce for the happy/greeting/eating states.
        bob: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '30%': { transform: 'translateY(-11%) scale(1.05)' },
          '60%': { transform: 'translateY(0) scale(0.97)' },
        },
        // One-shot hop arc — the dog leaps to a new spot on its stage.
        hop: {
          '0%, 100%': { transform: 'translateY(0) scaleY(1)' },
          '12%': { transform: 'translateY(4%) scaleY(0.9)' },
          '50%': { transform: 'translateY(-44%) scaleY(1.06)' },
          '88%': { transform: 'translateY(2%) scaleY(0.93)' },
        },
        // One-shot excited double-bounce in place.
        perk: {
          '0%, 100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-24%)' },
          '55%': { transform: 'translateY(0)' },
          '78%': { transform: 'translateY(-12%)' },
        },
        // One-shot playful side-to-side wiggle.
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '22%': { transform: 'rotate(-7deg)' },
          '52%': { transform: 'rotate(6deg)' },
          '80%': { transform: 'rotate(-3deg)' },
        },
        // One-shot stretch / yawn (squash-and-stretch).
        stretch: {
          '0%, 100%': { transform: 'scale(1, 1)' },
          '42%': { transform: 'scale(1.11, 0.9)' },
          '70%': { transform: 'scale(0.95, 1.08)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'pop-in': 'pop-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        breathe: 'breathe 2.6s ease-in-out infinite',
        bob: 'bob 0.85s ease-in-out infinite',
        hop: 'hop 0.68s ease-in-out',
        perk: 'perk 0.72s ease-in-out',
        wiggle: 'wiggle 0.62s ease-in-out',
        stretch: 'stretch 0.95s ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
