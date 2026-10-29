import type { Config } from 'tailwindcss';

/**
 * TripleQ AI brand tokens (the welcome site's theme). Colors come from the CSS custom properties in
 * src/styles/globals.css, so the palette has one definition; Tailwind reads them.
 */
const token = (name: string) => `var(--${name})`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tq: {
          accent: token('tq-accent'),
          'accent-soft': token('tq-accent-soft'),
          run: token('tq-run'),
          amber: token('tq-amber'),
          teal: token('tq-teal'),
          violet: token('tq-violet'),
        },
        primary: token('color-primary'),
        accent: token('color-accent'),
        warning: token('color-warning'),
        success: token('color-success'),
        text: token('color-text'),
        muted: token('color-text-muted'),
        page: token('color-bg'),
        surface: token('color-surface'),
        raised: token('color-raised'),
        'on-accent': token('color-on-accent'),
        line: token('color-border'),
        danger: token('color-danger'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['12px', '1.4'],
        sm: ['14px', '1.4'],
        base: ['16px', '1.5'],
        lg: ['20px', '1.2'],
        xl: ['28px', '1.2'],
        '2xl': ['40px', '1.1'],
        '3xl': ['56px', '1.1'],
      },
      borderRadius: { sm: '6px', md: '10px', lg: '16px', xl: '22px' },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
        md: '0 18px 40px -18px rgba(0, 0, 0, 0.75)',
        glow: '0 0 48px -20px var(--tq-accent)',
      },
      height: { nav: '56px' },
      width: { sidebar: '264px' },
    },
  },
  plugins: [],
};

export default config;
