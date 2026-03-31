/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        sonic: {
          50: "#f0f5ff",
          100: "#e0eaff",
          200: "#c2d5ff",
          300: "#93b4ff",
          400: "#6690ff",
          500: "#3d6bff",
          600: "#1a46ff",
          700: "#0033e6",
          800: "#002bbd",
          900: "#002299",
          950: "#001466",
        },
      },
    },
  },
  plugins: [],
};
