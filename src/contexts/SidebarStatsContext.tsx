import { createContext, useContext, useState, type ReactNode } from 'react'

interface SidebarStatsContextValue {
  lastUpdated: string | null
  setLastUpdated: (value: string | null) => void
  weeklyNewCount: number
  setWeeklyNewCount: (value: number) => void
}

const SidebarStatsContext = createContext<SidebarStatsContextValue>({
  lastUpdated: null,
  setLastUpdated: () => {},
  weeklyNewCount: 0,
  setWeeklyNewCount: () => {},
})

export function SidebarStatsProvider({ children }: { children: ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [weeklyNewCount, setWeeklyNewCount] = useState<number>(0)
  return (
    <SidebarStatsContext.Provider value={{ lastUpdated, setLastUpdated, weeklyNewCount, setWeeklyNewCount }}>
      {children}
    </SidebarStatsContext.Provider>
  )
}

export function useSidebarStats() {
  return useContext(SidebarStatsContext)
}
