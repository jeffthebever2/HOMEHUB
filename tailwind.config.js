/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './public/assets/**/*.js',
  ],
  safelist: [
    // Alert banner THEME classes — injected via JS template literals
    // Severity: Extreme
    'bg-red-950', 'border-red-500', 'bg-red-600', 'text-red-200', 'text-red-300',
    'bg-red-900/20', 'border-red-500',
    // Severity: Severe
    'bg-orange-950', 'border-orange-500', 'bg-orange-500', 'text-orange-200', 'text-orange-300',
    'border-orange-500', 'bg-orange-900/10',
    // Severity: Moderate
    'bg-yellow-950', 'border-yellow-500', 'bg-yellow-500', 'text-yellow-100', 'text-yellow-300',
    'bg-yellow-900/10',
    // Severity: Minor
    'bg-blue-950', 'border-blue-500', 'bg-blue-500', 'text-blue-200', 'text-blue-300',
    'bg-blue-900/10', 'border-blue-400',
    // Severity: Unknown
    'bg-gray-900', 'border-gray-500', 'bg-gray-500', 'text-gray-200',
    'bg-gray-500', 'bg-gray-800/60', 'border-gray-500',
    // Pill background+text combos
    'bg-red-600 text-white', 'bg-orange-500 text-white', 'bg-yellow-500 text-black',
    'bg-blue-500 text-white', 'bg-gray-500 text-white',
    // Impact card priority borders
    'border-red-500', 'border-orange-400', 'border-blue-500', 'border-gray-600',
    // Household impact alert theme borders
    'border-orange-500', 'border-yellow-500', 'border-blue-400',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
