/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#174f7e",
        teal: "#087b60",
        ink: "#172938",
        ink2: "#4e5f6b",
        ink3: "#6b7983",
        border: "#d0d9dc",
        bg: "#fffefa",
        light: "#eaf0f2",
        cream: "#f2f4f4"
      }
    }
  },
  plugins: []
};
