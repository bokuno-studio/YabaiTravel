/**
 * サーバーサイド用 i18n 初期化
 * ブラウザ言語検知を使わないバージョン
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'
import en from './locales/en.json'

// i18n が未初期化の場合のみ初期化（複数回呼ばれても安全）
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        ja: { translation: ja },
        en: { translation: en },
      },
      fallbackLng: 'ja',
      lng: 'ja',
      interpolation: { escapeValue: false },
    })
}

export default i18n
