/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './public/assets/**/*.js',
  ],
  // Keep dark class on <html> working
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
  // Safelist dynamic classes built via JS string concat / template literals
  safelist: [
    // Status dots / badge colors
    'bg-green-500', 'bg-red-500', 'bg-yellow-500',
    'text-green-400', 'text-red-400', 'text-yellow-400', 'text-blue-400',
    'text-gray-400', 'text-gray-500', 'text-gray-600', 'text-white',
    // Alert severity classes
    'warning', 'watch', 'advisory',
    // Opacity / hover states used by JS
    'opacity-0', 'opacity-55', 'opacity-100',
    'hover:bg-white/5', 'bg-blue-900/40', 'border-blue-700/50',
    // Grid responsive
    'md:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-7',
    'sm:grid-cols-2', 'sm:grid-cols-3',
    // Dynamic text sizes
    'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
    'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-9xl',
    'md:text-4xl', 'md:text-5xl', 'md:text-7xl', 'md:text-xl',
    'sm:text-6xl', 'sm:text-lg',
    // Spacing combos used in JS render functions
    'space-y-1', 'space-y-2', 'space-y-3', 'space-y-4', 'space-y-6',
    'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6',
    'p-2', 'p-3', 'p-4', 'p-6', 'p-8',
    'px-1', 'px-2', 'px-3', 'px-4', 'px-5', 'px-6', 'px-8',
    'py-0.5', 'py-1', 'py-1.5', 'py-2', 'py-3', 'py-4', 'py-8', 'py-12',
    'mb-1', 'mb-2', 'mb-3', 'mb-4', 'mb-5', 'mb-6', 'mb-8',
    'mt-0.5', 'mt-1', 'mt-2', 'mt-3', 'mt-4', 'mt-6', 'mt-7',
    'ml-1', 'ml-2', 'mr-2', 'pl-4', 'pl-5', 'pr-3', 'pr-10', 'pt-4', 'pb-1',
    'mx-auto', 'mx-4',
    // Borders
    'border', 'border-2', 'border-t', 'border-b', 'border-b-4', 'border-l-2', 'border-l-4',
    'border-gray-700', 'border-gray-800', 'border-blue-500', 'border-blue-600',
    'border-orange-500', 'border-purple-500', 'border-gray-500',
    // Backgrounds
    'bg-black', 'bg-gray-700', 'bg-gray-800', 'bg-gray-900',
    'bg-blue-600', 'bg-blue-900', 'bg-red-600', 'bg-green-600', 'bg-yellow-500',
    'bg-gradient-to-r', 'bg-gradient-to-t',
    'from-blue-600', 'to-blue-700', 'from-black', 'to-black/20', 'via-transparent',
    // Hover
    'hover:bg-blue-700', 'hover:bg-gray-700', 'hover:bg-gray-600',
    'hover:text-blue-300', 'hover:text-blue-400', 'hover:text-red-400', 'hover:text-green-300',
    'hover:opacity-90', 'hover:scale-105',
    // Active
    'active:opacity-70',
    // Width / height
    'w-1', 'w-3', 'w-4', 'w-5', 'w-8', 'w-10', 'w-16', 'w-20', 'w-28', 'w-full',
    'h-3', 'h-4', 'h-5', 'h-16',
    'min-h-screen', 'min-w-0', 'max-w-sm', 'max-w-md', 'max-w-lg',
    'max-w-2xl', 'max-w-4xl', 'max-w-5xl', 'max-w-6xl', 'max-w-7xl',
    'max-h-28', 'max-h-48', 'max-h-64',
    'min-h-[200px]',
    // Flex / grid layout
    'flex', 'flex-1', 'flex-col', 'flex-wrap', 'flex-shrink-0',
    'items-center', 'items-start', 'justify-between', 'justify-center', 'justify-end',
    'sm:flex-row', 'md:flex-row', 'sm:items-end', 'sm:items-start',
    'sm:justify-between', 'sm:mt-0', 'sm:mt-6', 'sm:p-6',
    'md:col-span-2', 'md:p-6', 'md:p-8',
    'grid', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4',
    // Display / position
    'hidden', 'block', 'inline-block', 'relative', 'absolute', 'fixed',
    // Text
    'font-bold', 'font-semibold', 'font-medium', 'font-light', 'font-mono',
    'text-center', 'text-left', 'text-right',
    'uppercase', 'italic', 'underline', 'line-through',
    'tracking-tight', 'tracking-wide',
    'truncate', 'break-all', 'select-none',
    // Misc
    'rounded', 'rounded-lg', 'rounded-xl', 'rounded-full',
    'shadow-lg', 'shadow-2xl',
    'transition', 'transition-all', 'transition-colors',
    'animate-pulse', 'animate-spin',
    'cursor-pointer', 'pointer-events-none',
    'overflow-hidden', 'overflow-auto', 'overflow-x-auto', 'overflow-y-auto',
    'z-10', 'z-50',
    '-translate-y-1/2',
    'col-span-2',
    'leading-none',
  ],
};
