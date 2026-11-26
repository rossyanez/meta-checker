// Policies for tests. Shaped like `Policy` in lib/destination.ts, which the fetcher checks them against.

type Answer = { address: string; family: 4 | 6 }

/** Admits the fixture server on 127.0.0.1 at its random port. Any name resolves to 127.0.0.1. */
export const fixturePolicy = {
  resolve: async (): Promise<Answer[]> => [{ address: '127.0.0.1', family: 4 }],
  allowLoopback: true,
}

/** The default rules with a resolver that fails every lookup, so no test reaches real DNS or the internet. */
export function noDnsPolicy() {
  const calls: string[] = []
  return {
    calls,
    resolve: async (hostname: string): Promise<Answer[]> => {
      calls.push(hostname)
      throw Object.assign(new Error(`no DNS in tests: ${hostname}`), { code: 'ENOTFOUND' })
    },
    allowLoopback: false,
  }
}

/** The given rules with a resolver that answers each call with the next list, repeating the last one. */
export function answering(allowLoopback: boolean, ...answers: string[][]) {
  const calls: string[] = []
  return {
    calls,
    resolve: async (hostname: string): Promise<Answer[]> => {
      const list = answers[Math.min(calls.length, answers.length - 1)]
      calls.push(hostname)
      return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
    },
    allowLoopback,
  }
}
