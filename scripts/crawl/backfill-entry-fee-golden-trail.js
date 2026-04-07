/**
 * Golden Trail Series entry_fee backfill
 * 各レース詳細ページから料金情報を抽出して categories に UPDATE
 *
 * 使い方:
 *   node scripts/crawl/backfill-entry-fee-golden-trail.js              # 実行
 *   node scripts/crawl/backfill-entry-fee-golden-trail.js --dry-run    # 確認のみ（UPDATE なし）
 */
import pg from 'pg'
import * as cheerio from 'cheerio'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve('.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  })
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const SCHEMA = process.env.SUPABASE_SCHEMA ?? 'yabai_travel'
const SLEEP_MS = 500
const BASE_URL = 'https://goldentrailseries.com'

/** sleep 関数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Golden Trail 詳細ページから料金情報を抽出
 * サイト構造: /racews/{race-slug}/ の詳細ページに料金情報が含まれる
 * @param {string} html
 * @returns {{ entry_fee: number, currency: string } | null}
 */
function extractEntryFeeFromGoldenTrail(html) {
  try {
    const $ = cheerio.load(html)

    // パターン1: JSON-LD schema.org から取得
    const jsonLds = $('script[type="application/ld+json"]')
    for (let i = 0; i < jsonLds.length; i++) {
      try {
        const data = JSON.parse($(jsonLds[i]).text())
        if (data.priceCurrency && data.price) {
          return {
            entry_fee: parseInt(data.price) || parseFloat(data.price),
            currency: data.priceCurrency,
          }
        }
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.priceCurrency && item.price) {
              return {
                entry_fee: parseInt(item.price) || parseFloat(item.price),
                currency: item.priceCurrency,
              }
            }
          }
        }
      } catch (_) {
        // JSON パースエラー、スキップ
      }
    }

    // パターン2: テーブルから料金を抽出
    let lowestFee = null
    let foundCurrency = null

    $('table').each((_, table) => {
      const $table = $(table)
      const rows = $table.find('tr')

      rows.each((_, row) => {
        const $row = $(row)
        const text = $row.text().trim()

        // 通貨コード検索
        const currencyMatch = text.match(/\b(EUR|USD|GBP|CHF|JPY|AUD|CAD|NZD|SGD|HKD|CNY)\b/)
        if (currencyMatch) {
          foundCurrency = currencyMatch[1]

          // 金額検出
          const priceMatches = text.match(/\d+(?:[.,]\d{2})?/g)
          if (priceMatches) {
            priceMatches.forEach((priceStr) => {
              const price = parseFloat(priceStr.replace(/[.,]/g, d => d === ',' ? '.' : ''))
              if (!isNaN(price) && price > 0 && price < 10000) {
                if (lowestFee === null || price < lowestFee) {
                  lowestFee = Math.round(price)
                }
              }
            })
          }
        }
      })
    })

    // パターン3: テキスト内の通貨+金額パターン
    if (!lowestFee) {
      const patterns = [
        /(?:€|EUR)\s*(\d{2,4})/gi,
        /\$\s*(\d{2,4})/gi,
        /(?:USD|CHF|GBP|JPY)\s*(\d{2,4})/gi,
      ]

      const textContent = $.text()
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(textContent))) {
          const price = parseInt(match[1])
          if (price > 0 && price < 10000) {
            // 通貨を判定
            const fullMatch = textContent.substring(match.index - 10, match.index + 30)
            if (fullMatch.includes('€') || fullMatch.includes('EUR')) foundCurrency = 'EUR'
            else if (fullMatch.includes('$') || fullMatch.includes('USD')) foundCurrency = 'USD'
            else if (fullMatch.includes('CHF')) foundCurrency = 'CHF'
            else if (fullMatch.includes('GBP')) foundCurrency = 'GBP'
            else if (fullMatch.includes('JPY')) foundCurrency = 'JPY'

            if (!lowestFee || price < lowestFee) {
              lowestFee = price
            }
          }
        }
      }
    }

    if (lowestFee && foundCurrency) {
      return { entry_fee: lowestFee, currency: foundCurrency }
    }

    return null
  } catch (e) {
    console.warn(`    抽出エラー: ${e.message}`)
    return null
  }
}

async function fetchPageWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })
      if (!res.ok) {
        if (attempt < maxRetries) {
          await sleep(1000)
          continue
        }
        return null
      }
      return await res.text()
    } catch (e) {
      if (attempt < maxRetries) {
        await sleep(1000)
        continue
      }
      return null
    }
  }
  return null
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log(`=== Golden Trail entry_fee backfill 開始 (DRY_RUN: ${DRY_RUN}) ===\n`)

  // golden-trail ソースに紐づき entry_fee が NULL のカテゴリを取得
  const { rows: categories } = await client.query(`
    SELECT
      c.id,
      c.name,
      e.official_url,
      c.entry_fee,
      c.entry_fee_currency
    FROM ${SCHEMA}.categories c
    JOIN ${SCHEMA}.events e ON c.event_id = e.id
    WHERE e.source = 'golden-trail'
      AND c.entry_fee IS NULL
    ORDER BY e.collected_at DESC
    LIMIT 500
  `)

  console.log(`対象カテゴリ: ${categories.length} 件\n`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < categories.length; i++) {
    const { id, name, official_url } = categories[i]

    // Golden Trail の詳細ページ URL
    // official_url: https://goldentrailseries.com/racews/{race-slug}/ など
    let detailPageUrl = official_url
    if (official_url && !official_url.includes('racews')) {
      // race listing ページの場合、racews へのリンクを探す必要があるが、
      // official_url が既に詳細ページへのリンクのはずなので直接使用
    }

    try {
      const html = await fetchPageWithRetry(detailPageUrl)
      if (!html) {
        console.log(`  [${i + 1}/${categories.length}] FETCH FAIL: ${name?.slice(0, 50)} | ${detailPageUrl?.slice(0, 50)}`)
        failCount++
        continue
      }

      const result = extractEntryFeeFromGoldenTrail(html)
      if (!result) {
        console.log(`  [${i + 1}/${categories.length}] EXTRACT FAIL: ${name?.slice(0, 50)}`)
        failCount++
        continue
      }

      if (!DRY_RUN) {
        await client.query(
          `UPDATE ${SCHEMA}.categories
           SET entry_fee = $1, entry_fee_currency = $2, updated_at = NOW()
           WHERE id = $3`,
          [result.entry_fee, result.currency, id]
        )
      }
      console.log(`  [${i + 1}/${categories.length}] UPDATE: ${name?.slice(0, 50)} | ${result.entry_fee} ${result.currency}`)
      successCount++
    } catch (e) {
      console.warn(`  [${i + 1}/${categories.length}] ERROR: ${name?.slice(0, 50)} | ${e.message}`)
      failCount++
    }

    if (i < categories.length - 1) {
      await sleep(SLEEP_MS)
    }
  }

  console.log(`\n完了:`)
  console.log(`  - 成功: ${successCount} 件`)
  console.log(`  - 失敗: ${failCount} 件`)
  if (DRY_RUN) {
    console.log(`  - DB 更新: なし（DRY_RUN）`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
