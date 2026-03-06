# バックエンド処理フロー

クロール・データ収集の処理の流れを整理。**認識合わせ用**。

バックエンドは大きく **2 系統** に分かれる:

1. **レース自体の詳細を取得** — 一覧ページから新規・更新を検知し、events / categories を DB に投入
2. **ロジを取得** — 東京起点のアクセス（経路・所要時間・現金要否・シャトル等）を取得し、access_routes 等に投入

---

## 1. 全体フロー（俯瞰）

```mermaid
flowchart TB
    subgraph トリガー
        T1[cron: 日次]
        T2[手動トリガー]
    end

    subgraph 系統A["系統A: レース詳細の取得"]
        T1 --> A1[一覧 URL をフェッチ]
        T2 --> A1
        A1 --> A2[変更検知]
        A2 --> A3[抽出・DB UPSERT]
        A3 --> EVENTS[(events)]
        A3 --> CATS[(categories)]
    end

    subgraph 系統B["系統B: ロジの取得"]
        T1 --> B1[access_routes が空のイベントを取得]
        T2 --> B1
        B1 --> B2[東京→会場の経路取得]
        B2 --> B3[公式詳細ページ or Google 等]
        B3 --> B4[access_routes UPSERT]
        B4 --> ROUTES[(access_routes)]
    end
```

---

## 2. 系統A: レース詳細の取得（一覧→抽出→DB）

```mermaid
flowchart LR
    URL[CHECK_TARGET_URLS] --> |GET| HTML
    HTML --> |ハッシュ比較| CHG{変更あり?}
    CHG --> |Yes| EXT[抽出]
    CHG --> |No| SKIP[スキップ]
    EXT --> |Cheerio/LLM| JSON
    JSON --> |UPSERT| EVENTS[(events)]
    JSON --> |UPSERT| CATS[(categories)]
```

| 対象 | 一覧ページ（A-Extremo, Golden Trail 等） |
|------|----------------------------------------|
| 出力 | 大会名・日付・URL・場所・カテゴリ |
| トリガー | cron または 手動（`npm run crawl:run` 等） |

---

## 3. 系統B: ロジの取得（東京起点のアクセス）

```mermaid
flowchart LR
    EV[(events)] --> |access_routes が空| TGT[対象イベント]
    TGT --> |公式詳細ページ or 外部API| SRC[ソース取得]
    SRC --> |経路・時間・現金要否| ROUT[access_routes]
    ROUT --> |UPSERT| DB[(Supabase)]
```

| 対象 | access_routes が空のイベント |
|------|-----------------------------|
| 起点 | 東京（初期は東京固定） |
| 取得項目 | 経路・乗り換え、所要時間、費用概算、現金要否、シャトル等 |
| ソース | 公式詳細ページのスクレイピング、Google Directions API 等 |

※ 他都市は将来拡張。

---

## 4. データの流れ（系統A 詳細）

```mermaid
flowchart LR
    URL[CHECK_TARGET_URLS] --> HTML[HTML]
    HTML --> HASH[content_hash]
    HASH --> SNAP[(crawl_snapshots)]
    SNAP --> RAW[生 HTML]
    RAW --> JSON[構造化 JSON]
    JSON --> EVENTS[(events)]
    JSON --> CATS[(categories)]
```

---

## 5. 各フェーズの詳細（系統A）

### Phase 1: フェッチ

```mermaid
flowchart LR
    A[CHECK_TARGET_URLS.md] --> B[URL 一覧]
    B --> C[HTTP GET]
    C --> D[HTML 取得]
    D --> E[Phase 2 へ]
```

| 項目 | 内容 |
|------|------|
| 入力 | チェック対象 URL 一覧 |
| 出力 | 各 URL の HTML レスポンス |
| コスト | 無料 |
| 実行場所 | Node スクリプト（axios/fetch） |

---

### Phase 2: 変更検知

```mermaid
flowchart LR
    A[HTML] --> B[レース一覧部分を抽出]
    B --> C[正規化ハッシュ計算]
    C --> D{DB に前回ハッシュあり?}
    D -->|No| E[新規: 保存してキューへ]
    D -->|Yes| F{同一?}
    F -->|Yes| G[スキップ]
    F -->|No| H[更新してキューへ]
```

| 項目 | 内容 |
|------|------|
| 入力 | HTML、source_url |
| 出力 | 変更あり → 抽出キューへ / 変更なし → スキップ |
| 保存先 | `crawl_snapshots`（source_url, content_hash, fetched_at） |
| コスト | 無料 |

---

### Phase 3: 抽出

```mermaid
flowchart LR
    A[抽出キュー] --> B[HTML を取得]
    B --> C{サイト別抽出スクリプト}
    C -->|Cheerio/正規表現| D[構造化 JSON]
    C -->|取れない部分| E[Claude Haiku 補助]
    E --> D
    D --> F{確定情報のみ?}
    F -->|Yes| G[DB UPSERT]
    F -->|No| H[格納しない]
```

| 項目 | 内容 |
|------|------|
| 入力 | 変更があった URL の HTML |
| 出力 | events / categories 用の構造化 JSON |
| 方式 | 優先: スクレイピング → 補助: LLM |
| コスト | LLM 使用時のみ発生 |

---

## 6. 抽出結果の形式（#20 で検証済み）

抽出スクリプトが返す JSON のイメージ。DB 投入時にマッピングする。

```mermaid
flowchart TB
    subgraph 抽出出力
        E1[name, event_date, location]
        E2[official_url, entry_url]
        E3[race_type, categories]
    end

    subgraph DB
        T1[events]
        T2[categories]
    end

    E1 --> T1
    E2 --> T1
    E3 --> T2
```

| フィールド例 | 説明 |
|--------------|------|
| `name` | 大会名 |
| `event_date` | 開催日（YYYY-MM-DD） |
| `location` | 開催地 |
| `official_url` | 公式 URL（識別キー候補） |
| `entry_url` | 申込 URL |
| `race_type` | トレラン / スパルタン / 等 |
| `categories` | カテゴリ配列（name, distance_km, elevation_gain, entry_fee 等） |

詳細は [SPEC_RACE_DATA.md](./SPEC_RACE_DATA.md) を参照。

---

## 7. 実行環境・トリガー

```mermaid
flowchart TB
    subgraph トリガー
        CRON[cron: 日次]
        MANUAL[手動: npm run crawl:run]
    end

    subgraph 実行
        CRON --> RUN[Node スクリプト]
        MANUAL --> RUN
        RUN --> RUN_A[系統A: レース詳細]
        RUN --> RUN_B[系統B: ロジ]
    end
```

| 項目 | 案 |
|------|-----|
| トリガー | **手動**（`npm run crawl:run`）で即時実行。cron は後から追加 |
| 対象 | 初期は少数ソース（A-Extremo, Golden Trail 等） |
| 実行場所 | ローカル or GitHub Actions workflow_dispatch |

---

## 8. 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [SPEC_CRAWL_DESIGN.md](./SPEC_CRAWL_DESIGN.md) | 変更検知・抽出戦略の詳細 |
| [SPEC_DATA_STRUCTURE.md](./SPEC_DATA_STRUCTURE.md) | テーブル構成・格納原則 |
| [SPEC_RACE_DATA.md](./SPEC_RACE_DATA.md) | 大会データ項目仕様 |
| [CHECK_TARGET_URLS.md](./data-sources/CHECK_TARGET_URLS.md) | チェック対象 URL 一覧 |
