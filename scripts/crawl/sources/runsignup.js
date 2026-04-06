/**
 * RunSignUp — US marathon and running events
 */
export const SOURCE_NAME = 'runsignup'
export const SOURCE_URLS = ['https://runsignup.com/']
export const RACE_TYPE = 'marathon'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []

  // Exclude service pages by URL pattern
  const excludedUrlPatterns = [
    /\/ai\//i,
    /\/library\//i,
    /\/newsletter\//i,
    /\/webinars\//i,
    /\/fundraising\//i,
    /\/email\//i,
    /\/video\//i,
    /\/blog\//i,
    /\/tools\//i,
    /\/calculator\//i
  ]

  // Exclude service pages by title pattern
  const excludedTitlePatterns = [
    /^RunSignup AI/i,
    /^Video Library/i,
    /^Newsletter Archive/i,
    /^Email$/i,
    /^Webinars & Events$/i,
    /^Fundraising$/i,
    /^Stair Climbs$/i,
    /^Fundraising Events$/i,
    /^AI Webinars$/i,
    /^AI Video Library$/i,
    /^Race Day Events$/i,
    /^RunSignup AI Application Library$/i,
    /^RunSignup AI Overview$/i,
    /^RunSignup AI Chatbot$/i,
    /^RunSignup AI for Vibe Coding$/i
  ]

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const text = $(el).text().trim()
    if (!href || !text || text.length < 5 || text.length > 120) return
    if (!/race|event|marathon|run|register/i.test(href + ' ' + text)) return
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href

    // Filter by URL pattern
    if (excludedUrlPatterns.some(pattern => pattern.test(fullUrl))) return

    // Filter by title pattern
    if (excludedTitlePatterns.some(pattern => pattern.test(text))) return

    // Must contain /race/ path
    if (!/\/race\//i.test(fullUrl)) return

    if (races.find((r) => r.official_url === fullUrl)) return
    races.push({ name: text, official_url: fullUrl, entry_url: fullUrl, race_type: RACE_TYPE, country: 'US', source: SOURCE_NAME })
  })
  return ctx.limitForEnv(races, 5)
}
