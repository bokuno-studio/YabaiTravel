/**
 * GA4 カスタムイベントヘルパー (#345)
 */

import { getUtmParams } from './utm'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function sendEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, { ...getUtmParams(), ...params })
  }
}

/** CTAボタンクリック */
export function trackCtaClick(ctaName: string, page: string) {
  sendEvent('cta_click', { cta_name: ctaName, page })
}

/** アフィリエイトリンククリック */
export function trackAffiliateClick(provider: string, eventId: string) {
  sendEvent('affiliate_click', { provider, event_id: eventId })
}

/** Pricingページ表示 */
export function trackPricingView() {
  sendEvent('pricing_view')
}

/** ガイドページ滞在 */
export function trackGuideRead(guideSlug: string, durationSec: number) {
  sendEvent('guide_read', { guide_slug: guideSlug, duration_sec: durationSec })
}

/** イベント詳細閲覧 */
export function trackEventDetailView(eventId: string, eventName: string, raceType: string | null) {
  sendEvent('event_detail_view', { event_id: eventId, event_name: eventName, race_type: raceType })
}

/** スクロール深度 */
export function trackScrollDepth(depth: number, page: string) {
  sendEvent('scroll_depth', { depth_percent: depth, page })
}
