import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const OUTBOUND = 'Send requests through lib/fetcher.ts, which checks where they go.'
const LITERAL_ONLY = 'Load modules by a plain string, so lint can check the name.'
const NETWORK_GLOBALS = ['fetch', 'WebSocket', 'EventSource']
const NETWORK_MODULES = ['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'dns/promises'].flatMap((name) => [
  name,
  `node:${name}`,
]).concat('undici')
const NETWORK_MODULE_PATTERN = '/^(node:)?(https?|http2|net|tls|dgram|dns|dns\\u002Fpromises)$|^undici$/'

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
        ...NETWORK_GLOBALS.map((name) => ({ name, message: OUTBOUND })),
      ],
      'no-restricted-properties': [
        'error',
        ...['globalThis', 'global', 'window', 'self'].flatMap((object) =>
          NETWORK_GLOBALS.map((property) => ({ object, property, message: OUTBOUND })),
        ),
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
        { selector: "ImportExpression[source.type='TemplateLiteral']", message: LITERAL_ONLY },
        { selector: "CallExpression[callee.name='require'][arguments.0.type='TemplateLiteral']", message: LITERAL_ONLY },
        // module.require(), process.getBuiltinModule() and createRequire() load modules lint can't follow.
        { selector: "CallExpression[callee.property.name='require']", message: LITERAL_ONLY },
        { selector: "CallExpression:matches([callee.name='getBuiltinModule'], [callee.property.name='getBuiltinModule'])", message: LITERAL_ONLY },
        { selector: "CallExpression:matches([callee.name='createRequire'], [callee.property.name='createRequire'])", message: LITERAL_ONLY },
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
