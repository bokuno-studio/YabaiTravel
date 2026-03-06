# 事象レポート: Supabase egress 使用量爆発（2026年）

**対象プロジェクト**: norm-changes（旧 spec-driven-app）  
**Supabase Org**: bokunon's Org（YabaiTravel と共通利用）

---

## 1. 事象概要

Supabase 組織の使用量がプランのクォータを超過し、警告メールが届いた。

- **期限**: 2026年3月24日から Fair Use Policy が適用される
- **主な超過項目**: egress 帯域幅が 5.5 GB を超えていた
- **猶予**: 当該請求期間は継続利用可能（猶予あり）

---

## 2. 原因推定

### 2.1 当初の仮説（一覧 API）

- `GET /api/norm-changes` で `include: { normSource: true }` により NormSource の**全カラム**（`rawText`・`rawTextPrev` 含む）を取得していた
- 一覧では使わない条文全文（1件あたり数十〜数百 KB）が毎回 DB から転送され、egress が膨らんでいた
- 1 リクエストあたり最大 100 件 × 2 カラム分 → 数 MB 規模の egress が発生する可能性

### 2.2 実際の主因（ingest の findUnique）

ユーザー指摘により判明:

- 「一覧表示してないのに置きてる」
- 「今日は延々といんげすととアナライズを毎日分走らせてるけど 5GB 以上使ってる」
- 「DB は 100MB も増えてない」

→ **ingest の `findUnique`** が主因の可能性が高い。

`src/lib/ingest-laws.ts` の既存チェックで、`findUnique` が NormSource の**全カラム**（rawText, rawTextPrev 含む）を取得していた。

- 更新時は `existing.id` のみ使用（更新データは bulkdownload から取得済み）
- rawText / rawTextPrev は一切使っていない
- 1 日あたり 10〜50 件 × 洗い替え日数分の findUnique が発生
- 1 件あたり rawText + rawTextPrev で数十〜数百 KB
- 例: 1,000 件 × 200KB ≒ **200MB**、5,000 件 × 200KB ≒ **1GB**

---

## 3. 実施した対策

### 対策 1: 一覧 API のオーバーフェッチ修正（Issue #47）

| 項目 | 内容 |
|------|------|
| **対象** | `GET /api/norm-changes`（`src/app/api/norm-changes/route.ts`） |
| **修正** | `normSource` の取得を `select` で明示し、`rawText`・`rawTextPrev` を除外 |
| **取得カラム** | `id`, `type`, `title`, `number`, `publishedAt`, `effectiveAt`, `url` のみ |
| **期待効果** | 一覧リクエストあたりの egress を数 MB → 数十 KB 程度に削減 |

※ 一覧をあまり見ない運用では効果は限定的だった。

### 対策 2: Ingest の findUnique 修正（Issue #49）

| 項目 | 内容 |
|------|------|
| **対象** | `src/lib/ingest-laws.ts` |
| **修正** | `findUnique` に `select: { id: true }` を追加し、id のみ取得 |
| **期待効果** | 更新時の egress をほぼゼロに削減 |

---

## 4. 結果

- Issue #47・#49 の修正を main にプッシュし、デプロイ完了
- 両 Issue はクローズ済み
- Supabase Usage Dashboard で egress の推移を確認するよう案内

---

## 5. 教訓・今後の注意

| 観点 | 内容 |
|------|------|
| **オーバーフェッチ** | `include: true` や `select` なしの取得は、大容量カラム（rawText 等）があるテーブルで egress 爆発のリスク |
| **バッチ処理** | 高頻度で走る ingest / cron は、1 回あたりの転送量 × 回数で egress が積み上がる |
| **必要最小限** | 更新チェックなどで id だけ必要な場合は `select: { id: true }` を明示する |
| **Usage Dashboard** | 定期的に egress の推移を確認し、異常な増加を早期に検知する |

---

## 6. 参考リンク

- [norm-changes Issue #47](https://github.com/bokunon/spec-driven-app/issues/47) — Supabase プラン枠超過の警告対応
- [norm-changes Issue #49](https://github.com/bokunon/spec-driven-app/issues/49) — Ingest の findUnique egress 削減
- [Supabase Fair Use Policy](https://supabase.com/docs/guides/platform/fair-use-policy)
