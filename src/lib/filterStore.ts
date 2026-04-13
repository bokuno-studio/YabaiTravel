/**
 * Global filter state store (persists across page navigations within the SPA).
 * Survives component unmount/remount. Also backed by sessionStorage for tab refresh.
 */

const STORAGE_KEY = 'yabai_filters'

interface FilterState {
  raceTypes: string[]
  countries: string[]
  dateRangeStart: string | null
  dateRangeEnd: string | null
  distanceRanges: number[]
  futureOnly: boolean
}

const DEFAULT: FilterState = {
  raceTypes: [],
  countries: [],
  dateRangeStart: null,
  dateRangeEnd: null,
  distanceRanges: [],
  futureOnly: true,
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
      countries: parsed.countries ?? [],
      dateRangeStart: parsed.dateRangeStart ?? null,
      dateRangeEnd: parsed.dateRangeEnd ?? null,
      distanceRanges: parsed.distanceRanges ?? [],
      futureOnly: parsed.futureOnly ?? true,
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
