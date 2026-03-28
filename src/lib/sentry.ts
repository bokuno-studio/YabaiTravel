export function initSentry() {
  if (import.meta.env.PROD) {
    const load = () => {
      import('./sentry-init')
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(load)
    } else {
      setTimeout(load, 2000)
    }
  }
}
