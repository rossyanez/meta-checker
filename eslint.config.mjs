import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const OUTBOUND = 'Send requests through lib/fetcher.ts, which checks where they go.'
const NETWORK_MODULES = ['http', 'https', 'http2', 'net', 'tls', 'dns', 'dns/promises'].flatMap((name) => [
  name,
  `node:${name}`,
]).concat('undici')
const NETWORK_MODULE_PATTERN = '/^(node:)?(https?|http2|net|tls|dns|dns\\u002Fpromises)$|^undici$/'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Outbound requests go through lib/fetcher.ts, which checks every destination. A direct one would skip the check.
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    // The preload requires node:http to stamp incoming requests; it sends none.
    ignores: ['lib/fetcher.ts', 'lib/destination.ts', 'lib/peer-address.cjs', '**/*.test.{ts,tsx}', 'tests/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'WebSocket', 'EventSource'].map((name) => ({ name, message: OUTBOUND })),
      ],
      'no-restricted-properties': [
        'error',
        ...['globalThis', 'global', 'window', 'self'].map((object) => ({ object, property: 'fetch', message: OUTBOUND })),
      ],
      'no-restricted-imports': ['error', { paths: NETWORK_MODULES.map((name) => ({ name, message: OUTBOUND })) }],
      'no-restricted-syntax': [
        'error',
        { selector: `ImportExpression[source.value=${NETWORK_MODULE_PATTERN}]`, message: OUTBOUND },
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=${NETWORK_MODULE_PATTERN}]`,
          message: OUTBOUND,
        },
        { selector: `TSExternalModuleReference[expression.value=${NETWORK_MODULE_PATTERN}]`, message: OUTBOUND },
      ],
    },
  },
  // CommonJS files, like the server preload, load modules with require().
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
