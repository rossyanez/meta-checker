// A fixed address, never built from input, so a shared report can't point visitors anywhere else.
const HIRE_URL = 'https://rossyanez.com/#contact'

export function HireCta() {
  return (
    <p className="hire-cta">
      <a href={HIRE_URL}>Want a full audit? Hire me</a>
    </p>
  )
}
