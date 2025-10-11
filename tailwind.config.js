module.exports = {
  content: [
    "./*.html",           // this includes HTML files in the root
    "./**/*.html",        // this includes HTML files in subfolders
    "./app/**/*.{js,ts,jsx,tsx}",  // Next.js components (if you use them)
    "./components/**/*.{js,ts,jsx,tsx}", // if you use a components folder
    // add more paths as needed!
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}