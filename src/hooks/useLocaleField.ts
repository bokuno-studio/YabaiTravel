import { useTranslation } from 'react-i18next'

/**
 * locale に応じて DB フィールドの日本語版 or 英語版を返すフック
 * _en が null の場合は日本語にフォールバック
 *
 * 使い方:
 *   const l = useLocaleField()
 *   l(event, 'name')      // → event.name_en ?? event.name (英語時)
 *   l(event, 'location')  // → event.location_en ?? event.location (英語時)
 */
export function useLocaleField() {
  const { i18n } = useTranslation()
  const isEn = i18n.language === 'en'

  return function localeField<T extends Record<string, unknown>>(
    obj: T | null | undefined,
    field: string
  ): string | null {
    if (!obj) return null
    if (isEn) {
      const enValue = obj[`${field}_en`]
      if (enValue != null && enValue !== '') return String(enValue)
    }
    const value = obj[field]
    return value != null ? String(value) : null
  }
}
