/**
 * Devils Circuit — obstacle course events in India
 */
export const SOURCE_NAME = 'devils-circuit'
export const RACE_TYPE = 'devils_circuit'

export function parse(html, url, cheerioLoad, ctx) {
  const $ = cheerioLoad(html)
  const races = []
  $('h2, h3').each((_, el) => {
    const t = $(el).text().trim()
    if (/^(Delhi|Mumbai|Bengaluru|Pune|Hyderabad|Kochi|Chennai|Guwahati|Jaipur|Lucknow|Indore|Ahmedabad|Dubai)/i.test(t)) {
      races.push({ name: `Devils Circuit ${t}`, official_url: url, entry_url: url, location: `${t}, India`, race_type: RACE_TYPE, source: SOURCE_NAME })
    }
  })
  return ctx.limitForEnv(races, 1)
}

export function matchesUrl(url) {
  return url.includes('devilscircuit.com')
}
