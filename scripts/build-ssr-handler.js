/**
 * api/ssr.js を生成するビルドスクリプト
 *
 * vite build（クライアント）完了後に実行し、
 * dist/client/index.html をテンプレートとして api/ssr.js に埋め込む。
 * dist/server/entry-server.js は相対パスで import する。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const templatePath = path.resolve(ROOT, 'dist/client/index.html')
if (!fs.existsSync(templatePath)) {
  console.error('Error: dist/client/index.html が見つかりません。先に vite build を実行してください。')
  process.exit(1)
}

const ssrBundlePath = path.resolve(ROOT, 'dist/server/entry-server.js')
if (!fs.existsSync(ssrBundlePath)) {
  console.error('Error: dist/server/entry-server.js が見つかりません。先に vite build --ssr を実行してください。')
  process.exit(1)
}

const template = fs.readFileSync(templatePath, 'utf-8')
const templateLiteral = JSON.stringify(template)

const ssrHandler = `/**
 * Vercel Serverless Function - SSR レンダリング
 * このファイルは scripts/build-ssr-handler.js により自動生成されます。手動編集禁止。
 */
import { render } from '../dist/server/entry-server.js'

const TEMPLATE = ${templateLiteral}

export default function handler(req, res) {
  try {
    const url = req.url || '/'
    const { html: appHtml, helmet } = render(url)

    const helmetTags = [
      helmet.title?.toString() ?? '',
      helmet.meta?.toString() ?? '',
      helmet.link?.toString() ?? '',
      helmet.script?.toString() ?? '',
    ]
      .filter(Boolean)
      .join('\\n    ')

    let finalHtml = TEMPLATE
    if (helmetTags) {
      finalHtml = finalHtml.replace('<!--ssr-helmet-->', helmetTags)
    }
    finalHtml = finalHtml.replace('<!--ssr-outlet-->', appHtml)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).end(finalHtml)
  } catch (e) {
    console.error('SSR Error:', e)
    // SSR 失敗時はフォールバック（SPA shell を返す）
    const fallback = TEMPLATE.replace('<!--ssr-outlet-->', '')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).end(fallback)
  }
}
`

const outputPath = path.resolve(ROOT, 'api/ssr.js')
fs.writeFileSync(outputPath, ssrHandler, 'utf-8')
console.log('api/ssr.js を生成しました（テンプレート埋め込み済み）')
