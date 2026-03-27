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

/** SPA ページ遷移時のページビュー送信 */
export function trackPageView(pagePath: string, pageTitle?: string) {
  sendEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle || document.title,
  })
}

/** CTAボタンクリック */
export function trackCtaClick(ctaName: string, ctaLocation: string, ctaVariant = 'default') {
  sendEvent('cta_click', { cta_name: ctaName, cta_location: ctaLocation, cta_variant: ctaVariant })
}

/** アフィリエイトリンククリック */
export function trackAffiliateClick(provider: string, eventId: string) {
  sendEvent('affiliate_click', { provider, event_id: eventId })
}

/** Pricingページ表示 */
export function trackPricingView() {
  sendEvent('pricing_view')
}

/** ガイドページ表示 */
export function trackGuideRead(guideSport: string, guideLanguage: string) {
  sendEvent('guide_read', { guide_sport: guideSport, guide_language: guideLanguage })
}

/** ガイドセクション到達 */
export function trackGuideSectionView(guideSport: string, sectionName: string) {
  sendEvent('guide_section_view', { guide_sport: guideSport, section_name: sectionName })
}

/** イベント詳細閲覧 */
export function trackEventDetailView(eventId: string, eventName: string, raceType: string | null) {
  sendEvent('event_detail_view', { event_id: eventId, event_name: eventName, race_type: raceType })
}

/** スクロール深度 */
export function trackScrollDepth(depth: number, pagePath: string, pageType: string) {
  sendEvent('scroll_depth', { depth_threshold: depth, page_path: pagePath, page_type: pageType })
}
