// Node-only startup checks, loaded by instrumentation.ts behind its runtime guard.
// A bad TRUSTED_PROXY_HOPS stops the server here, before it takes requests.
try {
  await import('./visitor')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

export {}
