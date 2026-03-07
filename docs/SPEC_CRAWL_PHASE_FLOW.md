# クロール処理フロー（フェーズ分け・サイト別）

#24 に基づく設計。**一覧取得（フェーズ1）**と**詳細埋め（フェーズ2）**を分離する。

---

## 1. フェーズ1 現状サマリ

### 1.1 目的

各ソースから**レース一覧**を取得し、DB に投入する。  
フェーズ2 で詳細を埋めるために、**レースを特定できる情報**（name + official_url 等）が取れれば十分。

### 1.2 取得項目の最小化（フェーズ2 のため）

| 必須 | 推奨 | 任意 |
|------|------|------|
| name | event_date | location |
| official_url | race_type | entry_url |
| source（収集元識別） | | entry_end |

**方針**: フェーズ1 の処理は絞って OK。  
タイトル以外の細かい情報（location, entry_end 等）は、取れるソースだけ取る。取れないソースは name + official_url のみでも可。

### 1.3 サイト別の取得ロジック（現状）

各サイトで HTML 構造・抽出方式が異なる。以下は全体フローとサイト別の分岐。

---

## 2. 全体フロー図

[SPEC_BACKEND_FLOW.md](./SPEC_BACKEND_FLOW.md) の 4 スクリプト構成に準拠。

- **① レース名収集** → events に name, official_url 等を投入
- **④ オーケストレータ** → ②詳細収集 と ③ロジ収集 を非同期で呼び出し。失敗 + 新規を延々ループ

---

## 3. フェーズ1: サイト別取得フロー

```mermaid
flowchart TB
    subgraph 入力
        URL[CHECK_TARGET_URLS.md]
    end

    subgraph サイト種別分岐
        URL --> ROUTER{URL パターン}
    end

    subgraph Spartan["Spartan（地域別）"]
        ROUTER -->|spartan.com| SP_FETCH[find-race ページ GET]
        SP_FETCH --> SP_EXT[extract-spartan.js]
        SP_EXT --> SP_OUT[name, date, location, official_url]
    end

    subgraph 専用抽出["専用抽出スクリプト"]
        ROUTER -->|a-extremo.com| AE_FETCH[一覧ページ GET]
        AE_FETCH --> AE_EXT[extract-a-extremo.js]
        AE_EXT --> AE_OUT[name, date, location, official_url, entry_end]

        ROUTER -->|goldentrailseries.com| GT_FETCH[一覧ページ GET]
        GT_FETCH --> GT_EXT[extract-golden-trail.js]
        GT_EXT --> GT_OUT[name, date, official_url]

        ROUTER -->|utmb.world| UT_FETCH[一覧ページ GET]
        UT_FETCH --> UT_EXT[extract-utmb.js]
        UT_EXT --> UT_OUT[name, date, official_url, location]

        ROUTER -->|hyrox.com| HX_FETCH[Find My Race GET]
        HX_FETCH --> HX_EXT[extract-hyrox.js]
        HX_EXT --> HX_OUT[name, date, official_url]

        ROUTER -->|strongviking.com| SV_FETCH[チケットページ GET]
        SV_FETCH --> SV_EXT[extract-strong-viking.js]
        SV_EXT --> SV_OUT[name, date, official_url]
    end

    subgraph 汎用抽出["汎用リンク抽出"]
        ROUTER -->|toughmudder.com| TM_FETCH[イベント一覧 GET]
        TM_FETCH --> TM_CHEERIO[Cheerio: a[href*=/events/]]
        TM_CHEERIO --> TM_OUT[name, official_url]

        ROUTER -->|devilscircuit.com| DC_FETCH[Find My Race GET]
        DC_FETCH --> DC_CHEERIO[Cheerio: h2/h3 都市名]
        DC_CHEERIO --> DC_OUT[name, location, official_url]

        ROUTER -->|runnet.jp| RN_FETCH[トレイル検索結果 GET]
        RN_FETCH --> RN_CHEERIO[Cheerio: 検索結果リンク]
        RN_CHEERIO --> RN_OUT[name, official_url]

        ROUTER -->|sportsentry.ne.jp| SE_FETCH[トップページ GET]
        SE_FETCH --> SE_CHEERIO[Cheerio: a[href*=/event/]]
        SE_CHEERIO --> SE_OUT[name, official_url]

        ROUTER -->|do.l-tike.com| LW_FETCH[トップページ GET]
        LW_FETCH --> LW_CHEERIO[Cheerio: a[href*=race/detail]]
        LW_CHEERIO --> LW_OUT[name, official_url]
    end

    subgraph 出力
        SP_OUT --> MERGE[レース一覧マージ]
        AE_OUT --> MERGE
        GT_OUT --> MERGE
        UT_OUT --> MERGE
        HX_OUT --> MERGE
        SV_OUT --> MERGE
        TM_OUT --> MERGE
        DC_OUT --> MERGE
        RN_OUT --> MERGE
        SE_OUT --> MERGE
        LW_OUT --> MERGE
        MERGE --> DB[(events)]
    end
```

---

## 4. サイト別 取得方式・出力項目一覧

| ソース | 抽出スクリプト | 取得項目 | 備考 |
|--------|----------------|----------|------|
| A-Extremo | extract-a-extremo.js | name, event_date, location, official_url, entry_url, entry_end | テーブル構造で安定 |
| Golden Trail | extract-golden-trail.js | name, event_date, official_url, entry_url | スライド構造。location は詳細にあり |
| Spartan | extract-spartan.js | name, event_date, location, official_url, entry_url | 地域別 URL、find-race ページ |
| UTMB | extract-utmb.js | name, event_date, official_url, location | World Series 一覧 |
| HYROX | extract-hyrox.js | name, event_date, official_url | Find My Race |
| Strong Viking | extract-strong-viking.js | name, event_date, official_url | チケットページ |
| Tough Mudder | run.js 内 Cheerio | name, official_url | a[href*=/events/] |
| Devils Circuit | run.js 内 Cheerio | name, location, official_url | h2/h3 都市名 |
| RUNNET | run.js 内 Cheerio | name, official_url | トレイル検索結果 |
| スポーツエントリー | run.js 内 Cheerio | name, official_url | トップ a[href*=/event/] |
| LAWSON DO! | run.js 内 Cheerio | name, official_url | トップ a[href*=race/detail] |

---

## 5. フェーズ2: 詳細埋めの設計方針

### 5.1 基本フロー

1. **レース名**を渡す
2. 検索（Google / 公式サイト等）で**公式情報**を取得
3. DB の空欄を**部分更新**で埋める

レース種別によって検索手法が変わる可能性あり（トレラン vs スパルタン vs マラソン等）→ トライ＆エラーで検証。

### 5.2 スクリプト分離（4 種・SPEC_BACKEND_FLOW 準拠）

| # | スクリプト | 役割 |
|---|------------|------|
| 1 | **レース名収集** | 各ソースからレース名をひたすら収集。events に投入 |
| 2 | **詳細収集** | 呼び出し元から与えられたレースの詳細情報をひたすら収集 |
| 3 | **ロジ収集** | 呼び出し元から与えられたレースのロジ情報をひたすら収集 |
| 4 | **オーケストレータ** | 2 と 3 を非同期で呼び出す。結果は子に書かせる。**失敗したもの**と**1 で新規収集されたもの**を延々呼び出す |

詳細は [SPEC_BACKEND_FLOW.md](./SPEC_BACKEND_FLOW.md) を参照。

### 5.3 フェーズ2 の検証方針

- 各種テストスクリプトを作成し、検索手法（Google Search API / スクレイピング / LLM 等）を試す
- レース種別ごとに有効な手法が異なる可能性 → トライ＆エラーで最適化

---

## 6. 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [SPEC_BACKEND_FLOW.md](./SPEC_BACKEND_FLOW.md) | バックエンド処理の全体フロー |
| [SPEC_CRAWL_DESIGN.md](./SPEC_CRAWL_DESIGN.md) | 変更検知・抽出戦略 |
| [CHECK_TARGET_URLS.md](./data-sources/CHECK_TARGET_URLS.md) | チェック対象 URL 一覧 |
