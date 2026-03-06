# 抽出テストスクリプト（#20 検証用）

レース情報の抽出方式を検証するスクリプト。

## 方式

| 方式 | スクリプト | コスト |
|------|------------|--------|
| Cheerio（構造化スクレイピング） | run-extract.js | 無料 |
| Claude Haiku | extract-with-claude.js | 有料 |

## 使い方

### Cheerio（推奨・無料）

```bash
# 全ソース
npm run extract:test

# または個別
node scripts/crawl-extract/run-extract.js a-extremo
node scripts/crawl-extract/run-extract.js golden-trail
node scripts/crawl-extract/run-extract.js all
```

### Claude（比較用）

```bash
# .env.local に ANTHROPIC_API_KEY を設定
node scripts/crawl-extract/extract-with-claude.js a-extremo
node scripts/crawl-extract/extract-with-claude.js golden-trail
```

## 検証結果（2026-03）

| ソース | Cheerio | 備考 |
|--------|---------|------|
| A-Extremo | ✓ 5件抽出 | テーブル構造で安定 |
| Golden Trail | ✓ 8件抽出 | スライド構造で安定 |

## 出力形式

SPEC_BACKEND_FLOW に準拠。DB 投入時にマッピングする。

```json
{
  "source": "https://...",
  "races": [
    {
      "name": "大会名",
      "event_date": "YYYY-MM-DD",
      "official_url": "https://...",
      "entry_url": "https://...",
      "location": "開催地",
      "race_type": "trail|adventure"
    }
  ]
}
```
