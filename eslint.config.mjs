import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Outbound requests go through lib/fetcher.ts, which checks every destination. A direct one would skip the check.
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts}'],
    ignores: ['lib/fetcher.ts', 'lib/destination.ts', '**/*.test.{ts,tsx}', 'tests/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Send requests through lib/fetcher.ts, which checks where they go.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: ['http', 'https', 'http2', 'net', 'tls', 'dns', 'dns/promises', 'undici'].flatMap((name) =>
            (name === 'undici' ? [name] : [name, `node:${name}`]).map((path) => ({
              name: path,
              message: 'Send requests through lib/fetcher.ts, which checks where they go.',
            })),
          ),
        },
      ],
    },
  },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'agent-playbooks/**',
  ]),
])
