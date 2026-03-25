const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
type UtmParams = Partial<Record<typeof UTM_KEYS[number], string>>

export function captureUtmParams(): void {
  if (typeof window === 'undefined') return
  const existing = sessionStorage.getItem('utm_params')
  if (existing) return
  const params = new URLSearchParams(window.location.search)
  const utm: UtmParams = {}
  let hasAny = false
  for (const key of UTM_KEYS) {
    const val = params.get(key)
    if (val) { utm[key] = val; hasAny = true }
  }
  if (hasAny) sessionStorage.setItem('utm_params', JSON.stringify(utm))
}

export function getUtmParams(): UtmParams {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem('utm_params')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
