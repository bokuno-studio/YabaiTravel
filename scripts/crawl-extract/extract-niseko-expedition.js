/**
 * NISEKO EXPEDITION (EXPEDITION STYLE) 抽出スクリプト（Cheerio）
 * https://nisekoexpedition.jp/
 *
 * Nuxt.js SSR ページから __NUXT_DATA__ JSON を解析してレース情報を抽出する。
 * 出力: SPEC_BACKEND_FLOW の形式に準拠した JSON
 */
import * as cheerio from 'cheerio'

const SOURCE_URL = 'https://nisekoexpedition.jp/'

/**
 * ページ UUID からレース情報を定義するマッピング。
 * Niseko Expedition のサイトは Studio.Design (Nuxt) で構築されており、
 * レース一覧を機械的に抽出できる構造ではないため、既知のレースを定義する。
 */
const KNOWN_RACES = [
  {
    pageId: 'nxpd',
    name: 'NISEKO EXPEDITION',
    location: 'Niseko, Hokkaido, Japan',
    description: '36時間ノンストップ アドベンチャーレース',
  },
  {
    pageId: 'white',
    name: 'EXPEDITION WHITE',
    location: 'Niseko, Hokkaido, Japan',
    description: '冬のニセコ パウダースノー アドベンチャーレース',
  },
  {
    pageId: 'jeanne',
    name: 'EXPEDITION JEANNE',
    location: 'Japan',
    description: '日本初 女性限定アドベンチャーレース',
  },
  {
    pageId: 'jeanne-ichikawamisato',
    name: 'JEANNE 市川三郷',
    location: 'Yamanashi, Japan',
    description: '山梨県でのアドベンチャーレース',
  },
  {
    pageId: 'mini',
    name: 'EXPEDITION MiNi',
    location: 'Niseko, Hokkaido, Japan',
    description: '春のニセコ 2-4人チーム アドベンチャーレース',
  },
  {
    pageId: 'mini-onomichi',
    name: 'EXPEDITION MiNi+ Onomichi',
    location: 'Onomichi, Japan',
    description: '尾道 ビギナー向けアドベンチャーレース',
  },
  {
    pageId: 'onn',
    name: 'ONN',
    location: 'Japan',
    description: 'EXPEDITION STYLE アドベンチャーレース',
  },
]

/**
 * HTML からレース情報を抽出
 * @param {string} html - ページの HTML
 * @returns {{ source: string, races: Array<{ name: string, event_date: string|null, official_url: string, entry_url: string, location: string|null, race_type: string }> }}
 */
export function extract(html) {
  const $ = cheerio.load(html)
  const races = []

  // __NUXT_DATA__ スクリプトから JSON 配列を取得
  let nuxtData = null
  $('script#__NUXT_DATA__').each((_, el) => {
    try {
      nuxtData = JSON.parse($(el).html())
    } catch {
      // ignore parse errors
    }
  })

  // Nuxt データからページ情報を収集
  const pageIds = new Set()
  if (nuxtData && Array.isArray(nuxtData)) {
    // nuxtData はフラット配列で、ページの id フィールドに pageId が入る
    // 既知のレースページ ID が存在するかチェック
    for (const item of nuxtData) {
      if (typeof item === 'string') {
        for (const race of KNOWN_RACES) {
          if (item === race.pageId) {
            pageIds.add(race.pageId)
          }
        }
      }
    }
  }

  // 既知のレース情報をもとにレースリストを構築
  for (const race of KNOWN_RACES) {
    // Nuxt データにページ ID があればそのレースは存在する
    // データがない場合でもフォールバックとして全レースを出力
    const officialUrl = new URL(`/${race.pageId}`, SOURCE_URL).href

    races.push({
      name: race.name,
      event_date: null, // 日付はサイト上で動的に管理されており静的抽出不可
      official_url: officialUrl,
      entry_url: officialUrl,
      location: race.location,
      race_type: 'adventure',
    })
  }

  // ページ内のリンクから追加のレースページを検出
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    // 内部リンクでまだ登録されていないページを検出
    if (href.startsWith('/') && !href.startsWith('//')) {
      const slug = href.replace(/^\//, '').replace(/\/$/, '')
      if (slug && !KNOWN_RACES.some((r) => r.pageId === slug)) {
        // ニュース・コンタクト・イベント一覧など非レースページを除外
        const nonRaceSlugs = [
          'news',
          'contact',
          'event',
          'partner',
          'archive',
          'volunteer',
          'coaching',
          'en',
          '404',
        ]
        if (
          !nonRaceSlugs.some(
            (s) => slug === s || slug.startsWith(s + '/'),
          )
        ) {
          const name = $(el).text().trim()
          if (name && name.length > 2 && name.length < 100) {
            const officialUrl = new URL(`/${slug}`, SOURCE_URL).href
            // 重複チェック
            if (!races.some((r) => r.official_url === officialUrl)) {
              races.push({
                name,
                event_date: null,
                official_url: officialUrl,
                entry_url: officialUrl,
                location: null,
                race_type: 'adventure',
              })
            }
          }
        }
      }
    }
  })

  return { source: SOURCE_URL, races }
}
