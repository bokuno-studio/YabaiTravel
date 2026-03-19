import { createContext, useContext, useState, type ReactNode } from 'react'

interface SidebarFilterContextValue {
  filterNode: ReactNode | null
  setFilterNode: (node: ReactNode | null) => void
}

const SidebarFilterContext = createContext<SidebarFilterContextValue>({
  filterNode: null,
  setFilterNode: () => {},
})

export function SidebarFilterProvider({ children }: { children: ReactNode }) {
  const [filterNode, setFilterNode] = useState<ReactNode | null>(null)
  return (
    <SidebarFilterContext.Provider value={{ filterNode, setFilterNode }}>
      {children}
    </SidebarFilterContext.Provider>
  )
}

export function useSidebarFilter() {
  return useContext(SidebarFilterContext)
}
