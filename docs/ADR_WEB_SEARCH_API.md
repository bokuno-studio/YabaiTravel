# ADR: Web検索API選定（欠落情報補完）

**ステータス**: 検討中（要レビュー・意思決定）
**作成日**: 2026-03-10
**関連Issue**: #48

---

## 背景・課題

`enrich-detail.js` は公式ページとその周辺数ページのみを取得するため、情報欠落が多い。
「大会名 エントリー料金 2026」などで能動的に補完する Web 検索機能を追加したい。

### 現在のフロー（課題あり）

```
official_url
  └─ 本文取得 → LLM抽出
  └─ 同ドメインのサブページ（最大3件）→ LLM抽出
  └─ 外部公式サイト（最大7件）→ LLM抽出
  └─ マージ → DB保存
```

**問題**: URL パターンにマッチしないページや、第三者サイトに散らばった情報は取得できない。

### 追加したいフロー

```
（上記フローで欠落フィールドが残った場合のみ）
  └─ Web検索「{大会名} エントリー料金 開催地 2026」
  └─ 検索結果をLLMに渡して補完
```

---

## 選択肢比較

### 前提：想定使用量

月100件の新規イベント × 2検索 = **月200検索**

---

### 選択肢 A: Tavily（たびリー）

**概要**: AIエージェント向けに設計された検索API。検索結果がLLM向けに整形済みで返ってくる。

| 項目 | 詳細 |
|------|------|
| 単価 | $0.008/検索（Basic）|
| 無料枠 | 1,000件/月 |
| 月コスト（200件） | **$0**（無料枠内）|
| 新規APIキー | `TAVILY_API_KEY` 必要 |
| 実装工数 | 小（fetch追加） |

**実装イメージ**:
```js
const res = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${TAVILY_API_KEY}` },
  body: JSON.stringify({ query: `${raceName} エントリー料金 開催日`, max_results: 3 }),
})
const { results } = await res.json()
// results[].content をLLMに渡して情報補完
```

**特徴**:
- LangChain / LlamaIndex 等のAIフレームワークで広く使われる実績あり
- 結果が `title / url / content` の構造化テキストで返ってくる（HTMLパース不要）
- Advanced Search（$0.016/検索）にすると深い情報まで取得可能

---

### 選択肢 B: Brave Search API

**概要**: Google/Bing に依存しない独自インデックスを持つ検索API。

| 項目 | 詳細 |
|------|------|
| 単価 | $0.005/検索 |
| 無料枠 | ~1,000件/月（$5クレジット相当）|
| 月コスト（200件） | **$0**（無料枠内）|
| 新規APIキー | `BRAVE_API_KEY` 必要 |
| 実装工数 | 小（fetch追加） |

**特徴**:
- Tavily より安い
- 検索結果は通常のJSON形式（Tavilyほど整形されていない）
- 独自インデックスのため、マイナーな日本のレースは索引漏れリスクあり

---

### 選択肢 C: Claude web_search tool

**概要**: Anthropic SDK に組み込みの Web 検索ツール。LLMが自律的に検索クエリを生成・実行・回答する。

| 項目 | 詳細 |
|------|------|
| 単価 | $0.01/検索 + トークン代（~$0.01/回）|
| 無料枠 | なし |
| 月コスト（200件） | **~$2〜4/月** |
| 新規APIキー | **不要**（既存 ANTHROPIC_API_KEY を使用）|
| 実装工数 | **最小**（既存コードに `tools` を1行追加）|

**実装イメージ**:
```js
// 既存の anthropic.messages.create() に tools を追加するだけ
const msg = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  system: LLM_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: `「${raceName}」の欠落情報を調べて補完してください` }],
})
```

**特徴**:
- 新規APIキー不要、実装変更が最小
- LLMが自律的に「何を検索するか」を判断する（制御しにくい面もある）
- 1回のメッセージで複数回検索することがある → コストがやや読みにくい

---

### 選択肢 D: Gemini Grounding（Google Search）

**非推奨** — 以下の理由により選択肢から除外することを推奨。

| 項目 | 詳細 |
|------|------|
| 単価 | $0.035/grounded prompt |
| 無料枠 | 1,500件/日（有料プランで）|
| 月コスト（200件） | $0（無料枠内）だが不安定 |
| 新規APIキー | Google AI Studio キー必要 |
| 実装工数 | 中（SDK変更・Gemini SDK追加）|

**問題点**:
- 1プロンプトが内部で何クエリ発行するか不定 → 課金が予測困難
- Gemini SDK への変更が必要（現在 Anthropic SDK を使用）
- 運用実績で「大変だった」課題あり

---

### ~~Bing Search API~~

**廃止済み**（2025年8月終了）— 選択肢外。

---

## 比較サマリー

| 観点 | Tavily | Brave | Claude web_search | Gemini Grounding |
|------|:------:|:-----:|:-----------------:|:----------------:|
| 月コスト（200件） | **$0** | **$0** | ~$2〜4 | $0※ |
| 実装工数 | 小 | 小 | **最小** | 中 |
| APIキー追加 | 必要 | 必要 | **不要** | 必要 |
| 日本語レース精度 | ◯ | △ | ◎ | ◎ |
| コスト予測しやすさ | ◎ | ◎ | ◯ | △ |
| 推奨度 | ◎ | ◯ | ◎ | ✕ |

※ Gemini Grounding の「$0」は内部クエリ数が不定のため実費は不明

---

## 推奨案

### 短期（今すぐ実装）: **Claude web_search tool**

- APIキー追加不要、既存コードへの変更が最小
- 月 ~$2〜4 は許容範囲
- LLMが文脈を理解した上で検索クエリを生成するため、精度が高い

### 中長期（スケール時）: **Tavily**

- 月1,000件まで無料枠
- 検索結果がLLM向けに整形されており、品質が安定
- AIエージェント向けに設計されているため、将来の拡張にも適している

---

## 意思決定が必要な項目

- [ ] どの選択肢を採用するか
- [ ] 「欠落フィールドがある場合のみ検索」という発動条件でよいか
- [ ] 初期実装は Claude web_search で進め、スケール時に Tavily へ移行するか

---

## 参考リンク

- [Tavily Pricing](https://docs.tavily.com/documentation/api-credits)
- [Brave Search API](https://brave.com/search/api/)
- [Claude web_search pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Gemini Grounding Pricing](https://ai.google.dev/gemini-api/docs/pricing)
