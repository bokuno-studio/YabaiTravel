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
    return event
  },
})
