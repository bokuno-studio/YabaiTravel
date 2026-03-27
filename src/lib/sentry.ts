import * as Sentry from '@sentry/react'

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || '',
      environment: 'production',
      tracesSampleRate: 1.0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
      ],
      beforeSend(event) {
        // ブラウザ拡張機能由来のノイズを除外
        const message = event.exception?.values?.[0]?.value || ''
        if (message.includes('runtime.sendMessage')) {
          return null
        }
        return event
      },
    })
  }
}
