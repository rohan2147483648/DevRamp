/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090b", // zinc-950 deep black
        panel: "#18181b",      // zinc-900 gray
        accent: "#f97316",      // orange-500
        border: "#27272a"       // zinc-800 border
      }
    },
  },
  plugins: [],
}
