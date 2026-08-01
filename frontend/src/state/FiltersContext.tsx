import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { ReportFilters } from '../api/types'

interface FCtx {
  filters: ReportFilters
  setFilters: (f: ReportFilters) => void
  reset: () => void
}

const Ctx = createContext<FCtx>(null!)
export const useReportFilters = () => useContext(Ctx)

export function ReportFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<ReportFilters>({})
  const reset = () => setFilters({})
  return <Ctx.Provider value={{ filters, setFilters, reset }}>{children}</Ctx.Provider>
}
