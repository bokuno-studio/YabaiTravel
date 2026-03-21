/**
 * Global filter state store (persists across page navigations within the SPA).
 * Survives component unmount/remount. Also backed by sessionStorage for tab refresh.
 */

const STORAGE_KEY = 'yabai_filters'

interface FilterState {
  raceTypes: string[]
  selectedMonths: string[]
  selectedCategories: string[]
  distanceRanges: number[]
  timeLimitMin: string
  costMin: number
  costMax: number
  entryStatus: string
  showPastEvents: boolean
}

const DEFAULT: FilterState = {
  raceTypes: [],
  selectedMonths: [],
  selectedCategories: [],
  distanceRanges: [],
  timeLimitMin: '',
  costMin: 0,
  costMax: Infinity,
  entryStatus: 'active',
  showPastEvents: false,
}

// In-memory store (survives component unmount)
let _state: FilterState | null = null

function loadFromSession(): FilterState {
  if (typeof sessionStorage === 'undefined') return { ...DEFAULT }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw)
    return {
      raceTypes: parsed.raceTypes ?? [],
      selectedMonths: parsed.selectedMonths ?? [],
      selectedCategories: parsed.selectedCategories ?? [],
      distanceRanges: parsed.distanceRanges ?? [],
      timeLimitMin: parsed.timeLimitMin ?? '',
      costMin: parsed.costMin ?? 0,
      costMax: parsed.costMax ?? Infinity,
      entryStatus: parsed.entryStatus ?? 'active',
      showPastEvents: parsed.showPastEvents ?? false,
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function getFilterState(): FilterState {
  if (_state) return _state
  _state = loadFromSession()
  return _state
}

export function saveFilterState(state: FilterState): void {
  _state = state
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

export function resetFilterState(): void {
  _state = { ...DEFAULT }
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
