import type { ReactNode } from 'react'
import type { Report as CheckReport } from '../lib/check'
import type { LinkProbe } from '../lib/fetcher'

const OG_KEYS = ['title', 'description', 'image', 'url', 'type'] as const

const PROBE_ERRORS: Record<NonNullable<LinkProbe['error']>, string> = {
  network: 'No response',
  timeout: 'Timed out',
  'too-many-redirects': 'Too many redirects',
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const codePoints = (s: string) => [...s].length

export function Report({ report }: { report: CheckReport }): ReactNode {
  const { page, links } = report
  return (
    <div className="report">
      <Section title="Summary" focusTarget>
        <dl>
          <dt>Status code</dt>
          <dd>{report.status}</dd>
          <dt>Final URL</dt>
          <dd className="value">{report.finalUrl}</dd>
          <dt>Redirects</dt>
          <dd>
            {report.redirects.length === 0 ? (
              'No redirects'
            ) : (
              <ol className="chain">
                {report.redirects.map((hop, i) => (
                  <li key={i} className="value">
                    {hop.status} {hop.url}
                  </li>
                ))}
                <li className="value">
                  {report.status} {report.finalUrl}
                </li>
              </ol>
            )}
          </dd>
        </dl>
      </Section>

      {page === null ? (
        <p className="note">
          The address returned {report.contentType ?? 'no content type'}, not an HTML page, so there are no tags to
          check.
        </p>
      ) : (
        <PageSections page={page} />
      )}

      {links && (
        <Section title="Broken links">
          <p>{`Checked ${links.checked} of ${plural(links.found, 'link', 'links')}`}</p>
          {links.broken.length === 0 ? (
            <p className="state">No broken links found</p>
          ) : (
            <ul className="values">
              {links.broken.map((probe) => (
                <li key={probe.url}>
                  <a className="value" href={probe.url} rel="nofollow noreferrer">
                    {probe.url}
                  </a>
                  <span className="meta">{probe.status ?? PROBE_ERRORS[probe.error ?? 'network']}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Speed">
        <dl>
          <dt>Time to first byte</dt>
          <dd>{`${report.speed.ttfbMs} ms`}</dd>
          <dt>HTML size</dt>
          <dd>{`${(report.speed.htmlBytes / 1024).toFixed(1)} KB`}</dd>
        </dl>
      </Section>
    </div>
  )
}

function PageSections({ page }: { page: NonNullable<CheckReport['page']> }) {
  const hidden = page.headingCount - page.headings.length
  return (
    <>
      <Section title="Title">
        <Values values={page.titles} showLength />
      </Section>
      <Section title="Meta description">
        <Values values={page.descriptions} showLength />
      </Section>
      <Section title="Canonical">
        <Values values={page.canonicals} />
      </Section>
      <Section title="Robots">
        <Values values={page.robots.tags} />
        <dl>
          <dt>Indexing</dt>
          <dd>{page.robots.index ? 'Allowed' : 'Blocked'}</dd>
          <dt>Following links</dt>
          <dd>{page.robots.follow ? 'Allowed' : 'Blocked'}</dd>
        </dl>
      </Section>
      <Section title="Headings outline">
        {page.headings.length === 0 ? (
          <p className="state">Missing</p>
        ) : (
          <ol className="outline">
            {page.headings.map((heading, i) => (
              <li key={i} style={{ marginInlineStart: `${(heading.level - 1) * 1.25}rem` }}>
                <span className="level">{`H${heading.level}`}</span>
                {heading.text === '' ? <span className="state">Empty</span> : <span className="value">{heading.text}</span>}
              </li>
            ))}
          </ol>
        )}
        {hidden > 0 && <p>{`${plural(hidden, 'more heading is', 'more headings are')} not shown.`}</p>}
      </Section>
      <Section title="Open Graph">
        <dl>
          {OG_KEYS.map((key) => (
            <div key={key}>
              <dt>{`og:${key}`}</dt>
              <dd>
                <Values values={page.og[key]} />
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  )
}

function Section({ title, focusTarget, children }: { title: string; focusTarget?: boolean; children: ReactNode }) {
  const id = `report-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} tabIndex={focusTarget ? -1 : undefined}>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Every occurrence of one tag: Missing, Empty, one value, or duplicates where the first one counts. */
function Values({ values, showLength = false }: { values: string[]; showLength?: boolean }) {
  if (values.length === 0) return <p className="state">Missing</p>
  if (values.length === 1) {
    return (
      <p>
        <Value value={values[0]} showLength={showLength} />
      </p>
    )
  }
  return (
    <>
      <p className="state">{`Found ${values.length}, the first one counts`}</p>
      <ol className="values">
        {values.map((value, i) => (
          <li key={i}>
            <Value value={value} showLength={showLength} />
          </li>
        ))}
      </ol>
    </>
  )
}

function Value({ value, showLength }: { value: string; showLength: boolean }) {
  if (value === '') return <span className="state">Empty</span>
  return (
    <>
      <span className="value">{value}</span>
      {showLength && <span className="meta">{plural(codePoints(value), 'character', 'characters')}</span>}
    </>
  )
}
