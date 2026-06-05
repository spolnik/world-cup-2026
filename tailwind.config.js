/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./app.js"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        ink: "#14211e",
        muted: "#66736d",
        paper: "#f7f4ec",
        surface: "#fffdf7",
        pitch: "#0b6b43",
        "pitch-dark": "#083d2d",
        blue: "#1d65b7",
        red: "#c93f4a",
        gold: "#d6a72b",
        lime: "#93bd3c",
      },
      boxShadow: {
        stadium: "0 24px 70px rgba(20, 33, 30, 0.18)",
        glow: "0 0 0 1px rgba(255,255,255,0.35), 0 18px 50px rgba(11,107,67,0.22)",
      },
      transitionTimingFunction: {
        stadium: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
