import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'src/lib/api/generated/**', 'next-env.d.ts', 'deploy/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // The UI never logs; failures are shown to the user from the message catalog.
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Only the configuration module reads the environment (as on the server, design rule 4).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/config/**', 'src/auth.ts'],
    rules: {
      'no-restricted-properties': ['error', { object: 'process', property: 'env', message: 'Read configuration from src/lib/config.' }],
    },
  },
  {
    // Scripts report what they generated.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
