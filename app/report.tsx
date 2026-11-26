import type { ReactNode } from 'react'
import type { Report as CheckReport } from '../lib/check'

export function Report({ report }: { report: CheckReport }): ReactNode {
  void report
  throw new Error('not implemented')
}
