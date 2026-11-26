// Runs once when the server starts. A bad TRUSTED_PROXY_HOPS stops the server here, before it takes requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    await import('./lib/visitor')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
