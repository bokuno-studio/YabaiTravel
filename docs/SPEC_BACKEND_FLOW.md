# バックエンド処理フロー

クロール・データ収集の処理の流れを整理。**認識合わせ用**。

---

## 1. 全体フロー（俯瞰）

```mermaid
flowchart TB
    subgraph トリガー
        T[cron: 日次実行]
    end

    subgraph Phase1["Phase 1: フェッチ（無料）"]
        T --> F1[CHECK_TARGET_URLS を読み込み]
        F1 --> F2[各 URL を HTTP GET]
    end

    subgraph Phase2["Phase 2: 変更検知（無料）"]
        F2 --> C1{前回スナップショットあり?}
        C1 -->|No| C2[新規: ハッシュ保存]
        C1 -->|Yes| C3{ハッシュ同一?}
        C3 -->|Yes| SKIP[スキップ（終了）]
        C3 -->|No| C4[ハッシュ更新]
        C2 --> Q[抽出キューへ]
        C4 --> Q
    end

    subgraph Phase3["Phase 3: 抽出（コスト発生）"]
        Q --> E1[キューから 1 件取得]
        E1 --> E2{スクレイピングで取れる?}
        E2 -->|Yes| E3[構造化データに変換]
        E2 -->|No| E4[LLM で補助]
        E4 --> E3
        E3 --> E5[DB に UPSERT]
    end

    subgraph 永続化
        DB[(Supabase)]
    end

    E5 --> DB
```

---

## 2. データの流れ（入出力）

```mermaid
flowchart LR
    subgraph 入力
        URL[CHECK_TARGET_URLS<br/>50+ URL 一覧]
    end

    subgraph Phase1
        HTML[HTML レスポンス]
    end

    subgraph Phase2
        HASH[content_hash]
        SNAP[(crawl_snapshots)]
    end

    subgraph Phase3
        RAW[生 HTML]
        JSON[構造化 JSON]
    end

    subgraph 出力
        EVENTS[(events)]
        CATS[(categories)]
    end

    URL -->|GET| HTML
    HTML -->|正規化してハッシュ| HASH
    HASH -->|比較・保存| SNAP
    SNAP -->|変更ありの URL| RAW
    RAW -->|抽出| JSON
    JSON -->|UPSERT| EVENTS
    JSON -->|UPSERT| CATS
```

---

## 3. 各フェーズの詳細

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

## 4. 抽出結果の形式（#20 で検証する出力）

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

## 5. 実行環境・スケジュール

```mermaid
flowchart TB
    subgraph スケジューラ
        CRON[GitHub Actions cron<br/>または Vercel Cron]
    end

    subgraph 実行
        CRON --> RUN[Node スクリプト実行]
        RUN --> P1[Phase 1]
        P1 --> P2[Phase 2]
        P2 --> P3[Phase 3]
    end

    subgraph 永続化
        SUP[(Supabase)]
    end

    P3 --> SUP
```

| 項目 | 案 |
|------|-----|
| トリガー | 日次（例: 毎朝 6:00 JST） |
| 実行場所 | GitHub Actions / Vercel Cron / 外部（未定） |
| 所要時間 | Phase 1+2: 数分 / Phase 3: 変更量による |

---

## 6. 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [SPEC_CRAWL_DESIGN.md](./SPEC_CRAWL_DESIGN.md) | 変更検知・抽出戦略の詳細 |
| [SPEC_DATA_STRUCTURE.md](./SPEC_DATA_STRUCTURE.md) | テーブル構成・格納原則 |
| [SPEC_RACE_DATA.md](./SPEC_RACE_DATA.md) | 大会データ項目仕様 |
| [CHECK_TARGET_URLS.md](./data-sources/CHECK_TARGET_URLS.md) | チェック対象 URL 一覧 |
