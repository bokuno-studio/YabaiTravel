# バックエンド処理フロー（概要）

クロール・データ収集の処理の流れ。詳細は各スクリプトの設計書を参照。

---

## スクリプト構成

| # | スクリプト | 役割 | 設計書 |
|---|------------|------|--------|
| ① | `collect-races.js` | 各ソースからレース名・URL を収集 → events に投入（LLMで name_en 同時生成） | [SPEC_CRAWL_COLLECT_RACES.md](./SPEC_CRAWL_COLLECT_RACES.md) |
| ②-A | `enrich-event.js` | 公式ページ + LLM でイベント基本情報・コース一覧を日英同時抽出 | [SPEC_CRAWL_ENRICH_EVENT.md](./SPEC_CRAWL_ENRICH_EVENT.md) |
| ②-B | `enrich-category-detail.js` | コース単位で詳細情報（参加費・制限時間・必携品等）を日英同時抽出 | [SPEC_CRAWL_ENRICH_CATEGORY_DETAIL.md](./SPEC_CRAWL_ENRICH_CATEGORY_DETAIL.md) |
| ③-ja | `enrich-logi-ja.js` | アクセス・宿泊情報を収集（東京起点、日本語版） | ※ #325 で改名予定。現在は `enrich-logi.js` |
| ③-en | `enrich-logi-en.js` | 会場アクセスポイント情報を収集（英語版） | ※ #325 で新規作成予定 |
| ④ | `orchestrator.js` | ②-A → ②-B → ③-ja → ③-en を順に呼び出す司令塔 | [SPEC_CRAWL_ORCHESTRATOR.md](./SPEC_CRAWL_ORCHESTRATOR.md) |

ユーティリティ:

| スクリプト | 役割 |
|------------|------|
| `lib/enrich-utils.js` | ②-A / ②-B 共有のユーティリティ（HTML取得・LLM呼び出し・Tavily検索等） |
| `sources/*.js` | ① のソースサイト別パーサープラグイン（42ファイル） |
| `reset-for-bilingual.js` | #316 一回限りリセットスクリプト |
| `reclassify-other.js` | race_type=other の一括再分類（メンテナンス用） |

廃止済み:

| スクリプト | 廃止理由 |
|------------|---------|
| `enrich-translate.js` | #316 で廃止。全ステップで日英同時抽出に統一 |
| `enrich-detail.js` | 旧版。②-A + ②-B を1スクリプトで実行（CLI後方互換用） |

---

## 全体フロー

```mermaid
flowchart TD
    subgraph Collect["① collect-races.js"]
        C0["READ: 外部ソースサイト（HTML）"]
        C0 --> C1["レース名・URL収集 + LLMで対訳生成"]
        C1 --> C2["WRITE: events INSERT<br>name, name_en, official_url"]
    end

    subgraph EnrichA["②-A enrich-event.js"]
        A0["READ: events.official_url<br>+ 外部公式ページ（HTML）"]
        A0 --> A1["1つのプロンプトで日英同時抽出"]
        A1 --> A2["WRITE: events UPDATE<br>description, location, event_date等<br>日本語カラム + _en カラム"]
        A1 --> A3["WRITE: categories INSERT<br>name, name_en, distance"]
    end

    subgraph EnrichB["②-B enrich-category-detail.js"]
        B0["READ: categories.event_id, name<br>+ events.official_url<br>+ 外部公式ページ（HTML）"]
        B0 --> B1["公式ページからHTML取得<br>カテゴリ名で該当セクション特定"]
        B1 --> B2["LLMに参加費・制限時間・必携品等を<br>日本語+英語で同時抽出"]
        B2 --> B4{"必須フィールドが未取得?"}
        B4 -->|Yes| B5["関連ページ最大3件を追加取得<br>→ LLMで不足フィールド補完"]
        B5 --> B6{"まだ必須フィールドが未取得?"}
        B6 -->|Yes| B7["Tavily検索で補完"]
        B6 -->|No| B3
        B7 --> B3
        B4 -->|No| B3
        B3["WRITE: categories UPDATE<br>entry_fee, time_limit, mandatory_gear等<br>日本語カラム + _en カラム"]
    end

    subgraph LogiJa["③-ja enrich-logi-ja.js"]
        LJ0["READ: events.location"]
        LJ0 --> LJ1["東京起点の旅程収集（日本語版）"]
        LJ1 --> LJ2["WRITE: access_routes (origin_type=tokyo)<br>+ accommodations"]
    end

    subgraph LogiEn["③-en enrich-logi-en.js（#325 予定）"]
        LE0["READ: events.location"]
        LE0 --> LE1["会場アクセスポイント情報収集（英語版）<br>最寄り空港・駅・交通手段"]
        LE1 --> LE2["WRITE: access_routes (origin_type=venue_access)"]
    end

    C2 --> A0
    A3 --> B0
    A2 --> LJ0
    A2 --> LE0

    style C0 fill:#2196F3,color:white
    style A0 fill:#2196F3,color:white
    style B0 fill:#2196F3,color:white
    style LJ0 fill:#2196F3,color:white
    style LE0 fill:#2196F3,color:white
    style C2 fill:#4CAF50,color:white
    style A2 fill:#4CAF50,color:white
    style A3 fill:#4CAF50,color:white
    style B3 fill:#4CAF50,color:white
    style LJ2 fill:#4CAF50,color:white
    style LE2 fill:#4CAF50,color:white
```

### 1イベントあたりの処理順序

```
②-A enrichEvent            → イベント情報 + コース特定
                               ↓
②-B enrichCategoryDetail × N → 各コースの詳細情報（1コース1LLM呼び出し）
                               ↓
③-ja enrichLogiJa           → 東京起点の旅程（日本語版）
③-en enrichLogiEn           → 会場アクセスポイント（英語版）※#325 で追加予定
```

---

## リトライポリシー（#316）

### 基本方針

- **全エラー即リトライ**（クールダウンなし、エラー種別による分岐なし）
- **上限3回で停止** → Telegramレポートに上限到達件数を表示
- 切り分けは上限到達後に `/enrich-triage` スキルで人が行う

### バッチ対象判定クエリ（events・categories 共通）

```sql
WHERE collected_at IS NULL AND attempt_count < 3
```

### 成功の定義

必須フィールドテンプレートで定義されたフィールドがすべて埋まった場合に `collected_at = NOW()` を設定。

- 共通テンプレート（②-B）: `entry_fee`
- 種別テンプレート: #318 で順次追加（現在は空）

### 状態遷移

```mermaid
flowchart TD
    S1["未処理<br>collected_at: NULL<br>attempt_count: 0"]
    S2["処理中（リトライ中）<br>collected_at: NULL<br>attempt_count: 1-2"]
    S3["成功<br>collected_at: 日時"]
    S4["上限到達<br>collected_at: NULL<br>attempt_count: 3"]

    S1 -->|"成功"| S3
    S1 -->|"失敗"| S2
    S2 -->|"成功"| S3
    S2 -->|"失敗"| S2
    S2 -->|"3回目の失敗"| S4
    S4 -->|"リセット"| S1
    S4 -->|"ローカルパッチ"| S3
    S4 -->|"削除"| DEL["削除済み"]

    style S1 fill:#2196F3,color:white
    style S2 fill:#ff9800,color:white
    style S3 fill:#4CAF50,color:white
    style S4 fill:#f44336,color:white
    style DEL fill:#9E9E9E,color:white
```

---

## 実行順序

```bash
# 1. レース名収集
npm run crawl:collect

# 2. イベント情報・カテゴリ詳細・ロジ収集（オーケストレータ経由）
npm run crawl:orchestrate
```

GitHub Actions で自動実行（3つのワークフローに分離）:
- `crawl-collect.yml`: レース名収集（1日3回 06:00/14:00/22:00 JST）
- `crawl-enrich-events.yml`: ②-A + ③ + コスト集計（10分おき）
- `crawl-enrich-categories.yml`: ②-B（10分おき）

---

## 設計原則

### コース vs 申込区分

**コース**（categories テーブルに格納）:
- 距離・ルートが異なるもの（例: フルマラソン / ハーフマラソン / 10km）

**申込区分**（格納しない）:
- 同じコースの性別/年齢/会員種別の違い（例: 男子10km / 女子10km / R.LEAGUE 10km）
- Wave start の違い（例: Wave 1 / Wave 2）
- エントリー時期の違い（例: 早期申込 / 通常申込 / レイトエントリー）

### バイリンガル対応（#316）

- 全ステップで1プロンプト・日英同時抽出
- 翻訳ジョブ（⑤ enrich-translate.js）は廃止
- 日本語カラムと `_en` カラムを同時に書き込み

### 必須フィールドテンプレート

フォールバック（関連ページ・Tavily）と成功判定に使用。詳細は `docs/FIELD_MATRIX.md` を参照。

```
共通テンプレート ∪ 種別テンプレート = 最終必須リスト
```

### ③ ロジ収集の言語分離（#325 予定）

| バッチ | 用途 | 起点 | origin_type |
|--------|------|------|-------------|
| ③-ja | 日本語版 | 東京 | tokyo |
| ③-en | 英語版 | 会場アクセスポイント（最寄り空港・駅） | venue_access |

英語版は起点を固定せず、会場側のアクセスポイント一覧を提示する。フロントエンドで `origin_type` に応じて表示を切り替え。

---

## 関連ドキュメント

- [SPEC_CRAWL_COLLECT_RACES.md](./SPEC_CRAWL_COLLECT_RACES.md)
- [SPEC_CRAWL_ENRICH_EVENT.md](./SPEC_CRAWL_ENRICH_EVENT.md)
- [SPEC_CRAWL_ENRICH_CATEGORY_DETAIL.md](./SPEC_CRAWL_ENRICH_CATEGORY_DETAIL.md)
- [SPEC_CRAWL_ENRICH_LOGI.md](./SPEC_CRAWL_ENRICH_LOGI.md)
- [SPEC_CRAWL_ORCHESTRATOR.md](./SPEC_CRAWL_ORCHESTRATOR.md)
- [SPEC_DATA_SOURCES.md](./SPEC_DATA_SOURCES.md)
- [SPEC_RACE_DATA.md](./SPEC_RACE_DATA.md)
- [FIELD_MATRIX.md](./FIELD_MATRIX.md)
