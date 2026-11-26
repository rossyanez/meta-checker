'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { checkAction } from './actions'
import { Report } from './report'

export function Checker() {
  const [result, formAction, pending] = useActionState(checkAction, null)
  // Controlled, so React's reset after each action does not clear the address the user typed.
  const [url, setUrl] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result?.kind === 'report') reportRef.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [result])

  return (
    <>
      {/* noValidate lets a bare host like example.com through; the server adds https://. */}
      <form action={formAction} noValidate className="check-form">
        <label htmlFor="url">Page URL</label>
        <div className="check-row">
          <input
            id="url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="submit" disabled={pending}>
            Check
          </button>
        </div>
      </form>

      <p className="status" role="status" aria-live="polite">
        {pending ? 'Checking the page. This can take up to 30 seconds.' : ''}
      </p>

      {!pending && result?.kind === 'error' && (
        <p className="error" role="alert">
          {result.message}
        </p>
      )}
      {!pending && result?.kind === 'report' && (
        <div ref={reportRef}>
          <Report report={result.report} />
        </div>
      )}
    </>
  )
}
