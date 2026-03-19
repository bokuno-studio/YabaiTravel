/**
 * Vercel Serverless Function - SSR レンダリング
 * このファイルは scripts/build-ssr-handler.js により自動生成されます。手動編集禁止。
 */
import { render } from '../dist/server/entry-server.js'

const TEMPLATE = "<!doctype html>\n<html lang=\"ja\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/vite.svg\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>yabai.travel</title>\n    <meta name=\"description\" content=\"トレラン・スパルタン・ハイロックス等エンデュランス系大会の情報と参戦ロジスティクスを提供するポータルサイト\" />\n    <meta property=\"og:title\" content=\"yabai.travel\" />\n    <meta property=\"og:description\" content=\"トレラン・スパルタン・ハイロックス等エンデュランス系大会の情報と参戦ロジスティクスを提供するポータルサイト\" />\n    <meta property=\"og:type\" content=\"website\" />\n    <!-- Google tag (gtag.js) -->\n    <script async src=\"https://www.googletagmanager.com/gtag/js?id=G-TNN6DES8DP\"></script>\n    <script>\n      window.dataLayer = window.dataLayer || [];\n      function gtag(){dataLayer.push(arguments);}\n      gtag('js', new Date());\n      gtag('config', 'G-TNN6DES8DP');\n    </script>\n    <script type=\"module\" crossorigin src=\"/assets/index-ChyLwoEJ.js\"></script>\n    <link rel=\"stylesheet\" crossorigin href=\"/assets/index-CZGbyCAK.css\">\n  </head>\n  <body>\n    <div id=\"root\"><!--ssr-outlet--></div>\n  </body>\n</html>\n"

export default function handler(req, res) {
  try {
    const url = req.url || '/'
    const { html: appHtml } = render(url)

    let finalHtml = TEMPLATE
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
