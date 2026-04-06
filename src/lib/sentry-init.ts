import {
  init,
  browserTracingIntegration,
  captureConsoleIntegration,
} from '@sentry/react'

init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  environment: 'production',
  tracesSampleRate: 1.0,
  integrations: [
    browserTracingIntegration(),
    captureConsoleIntegration({ levels: ['error'] }),
  ],
  beforeSend(event) {
    const message = event.exception?.values?.[0]?.value || ''
    if (message.includes('runtime.sendMessage')) {
      return null
    }
    // refresh token 失効は既知の正常フロー。Sentryノイズ除去
    if (
      message.toLowerCase().includes('invalid refresh token') ||
      message.toLowerCase().includes('refresh token not found')
    ) {
      return null
    }
    return event
  },
})
