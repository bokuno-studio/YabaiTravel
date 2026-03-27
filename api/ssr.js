/**
 * Vercel Serverless Function - SSR レンダリング
 * このファイルは scripts/build-ssr-handler.js により自動生成されます。手動編集禁止。
 */
import { render } from '../dist/server/entry-server.js'

const TEMPLATE = "<!doctype html>\n<html lang=\"ja\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/favicon-32.png\" />\n    <link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\" />\n    <link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>yabai.travel</title>\n    <meta name=\"description\" content=\"トレラン・スパルタン・ハイロックス等エンデュランス系大会の情報と参戦ロジスティクスを提供するポータルサイト\" />\n    <meta property=\"og:title\" content=\"yabai.travel\" />\n    <meta property=\"og:description\" content=\"トレラン・スパルタン・ハイロックス等エンデュランス系大会の情報と参戦ロジスティクスを提供するポータルサイト\" />\n    <meta property=\"og:type\" content=\"website\" />\n    <!-- Preconnect to critical origins -->\n    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />\n    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />\n    <link rel=\"dns-prefetch\" href=\"https://maps.googleapis.com\" />\n    <link rel=\"dns-prefetch\" href=\"https://supabase.co\" />\n    <!-- Font display swap for system font fallback during load -->\n    <style>\n      @font-face {\n        font-family: 'Inter';\n        font-display: swap;\n        src: local('Inter');\n      }\n    </style>\n    <!-- Google Search Console verification: add meta tag here after registration -->\n    <!-- Google tag (gtag.js) - deferred to reduce TBT -->\n    <script>\n      window.addEventListener('load', function() {\n        var s = document.createElement('script');\n        s.src = 'https://www.googletagmanager.com/gtag/js?id=G-TNN6DES8DP';\n        s.async = true;\n        document.head.appendChild(s);\n        s.onload = function() {\n          window.dataLayer = window.dataLayer || [];\n          function gtag(){dataLayer.push(arguments);}\n          gtag('js', new Date());\n          gtag('config', 'G-TNN6DES8DP', { send_page_view: false });\n        };\n      });\n    </script>\n    <script type=\"module\" crossorigin src=\"/assets/index-CMFPI0OE.js\"></script>\n    <link rel=\"modulepreload\" crossorigin href=\"/assets/vendor-react-CEChUk-l.js\">\n    <link rel=\"modulepreload\" crossorigin href=\"/assets/vendor-supabase-DTqiiTOY.js\">\n    <link rel=\"modulepreload\" crossorigin href=\"/assets/vendor-sentry-DkpIJQG7.js\">\n    <link rel=\"modulepreload\" crossorigin href=\"/assets/vendor-i18n-5xXoTvtS.js\">\n    <link rel=\"modulepreload\" crossorigin href=\"/assets/vendor-ui-BS5OMAJZ.js\">\n    <link rel=\"stylesheet\" crossorigin href=\"/assets/index-Cr_e87nn.css\">\n  </head>\n  <body>\n    <div id=\"root\"><!--ssr-outlet--></div>\n  </body>\n</html>\n"

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
