import type { Metric } from 'web-vitals'

function sendToGA4(metric: Metric) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.name === 'CLS' ? metric.delta * 1000 : metric.delta),
      event_category: 'Web Vitals',
      event_label: metric.id,
      non_interaction: true,
    })
  }
}

export function initWebVitals() {
  import('web-vitals').then(({ onLCP, onCLS, onFCP, onTTFB, onINP }) => {
    onLCP(sendToGA4)
    onCLS(sendToGA4)
    onFCP(sendToGA4)
    onTTFB(sendToGA4)
    onINP(sendToGA4)
  })
}
