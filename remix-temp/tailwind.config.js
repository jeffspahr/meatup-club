/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'meat-red': '#8B0000',
        'meat-brown': '#5C4033',
      },
    },
  },
  plugins: [],
}
