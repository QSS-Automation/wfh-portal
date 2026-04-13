/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#185FA5',
        'primary-dark': '#0C447C',
        'primary-light': '#E6F1FB',
        success: '#1A6B3A',
        'success-light': '#D6F0E0',
        warning: '#7A5500',
        'warning-light': '#FFF0CC',
        danger: '#A32D2D',
        'danger-light': '#FCEBEB',
        neutral: '#444441',
        'neutral-light': '#F1EFE8',
        'border-default': '#E8E7E0',
        'border-light': '#F0EFE8',
        'text-primary': '#1A1A18',
        'text-secondary': '#73726C',
        'text-muted': '#B4B2A9',
        'bg-page': '#F5F4F0',
        'bg-card': '#FFFFFF',
        'bg-surface': '#FAFAF8',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
        chip: '20px',
      }
    },
  },
  plugins: [],
}
