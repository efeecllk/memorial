/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bone: '#F4F1EA',
        cream: '#ECE7DB',
        ink: '#14110D',
        'ink-soft': '#423A2E',
        rule: '#C8BCA0',
        'rule-soft': '#DDD3BB',
        blood: '#7A1F1F',
        ocean: '#1F4250',
        ochre: '#9C7A2F',
        moss: '#4A5C3A',
        smoke: '#6E665B',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        body: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
}
