/**
 * File:        apps/broker-admin/tailwind.config.ts
 * Module:      broker-admin · Build Config
 * Purpose:     Tailwind + Obsidian UI preset for Broker Admin app
 *
 * Depends on:
 *   - ../../libs/obsidian-ui/src/tailwind/preset — relative import (PostCSS can't resolve TS paths)
 *
 * Key invariants:
 *   - Relative import for preset (PostCSS doesn't resolve TS path aliases)
 *   - Content paths cover src/app, shared, and obsidian-ui lib
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import type { Config } from 'tailwindcss';
import { obsidianTailwindPreset } from '../../libs/obsidian-ui/src/tailwind/preset';

const config: Config = {
  presets: [obsidianTailwindPreset as Config],
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/shared/**/*.{js,ts,jsx,tsx,mdx}',
    '../../libs/obsidian-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        ui: ['var(--font-ui)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bull:   'rgb(16 217 150 / <alpha-value>)',
        bear:   'rgb(255 59 92 / <alpha-value>)',
        warn:   'rgb(245 158 11 / <alpha-value>)',
        accent: 'rgb(59 130 246 / <alpha-value>)',
        gold:   'rgb(234 179 8 / <alpha-value>)',
        purple: 'rgb(168 85 247 / <alpha-value>)',
      },
    },
  },
};

export default config;
