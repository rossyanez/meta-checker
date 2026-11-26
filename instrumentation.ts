// Runs once when the server starts. The checks live in a Node-only module, so the Edge build never sees them.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/startup')
}
