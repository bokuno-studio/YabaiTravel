# バックエンド処理フロー（概要）

クロール・データ収集の処理の流れ。詳細は各スクリプトの設計書を参照。

---

## スクリプト構成（4種 + ユーティリティ）

| # | スクリプト | 役割 | 設計書 |
|---|------------|------|--------|
| ① | `collect-races.js` | 各ソースからレース名・URL を収集 → events に投入 | [SPEC_CRAWL_COLLECT_RACES.md](./SPEC_CRAWL_COLLECT_RACES.md) |
| ② | `enrich-detail.js` | 公式ページ + LLM でカテゴリ・詳細情報を収集 | [SPEC_CRAWL_ENRICH_DETAIL.md](./SPEC_CRAWL_ENRICH_DETAIL.md) |
| ③ | `enrich-logi.js` | アクセス・宿泊情報を収集（東京起点） | [SPEC_CRAWL_ENRICH_LOGI.md](./SPEC_CRAWL_ENRICH_LOGI.md) |
| ④ | `orchestrator.js` | ② と ③ を呼び出す司令塔。未処理を延々処理 | [SPEC_CRAWL_ORCHESTRATOR.md](./SPEC_CRAWL_ORCHESTRATOR.md) |
| - | `reclassify-other.js` | race_type=other の一括再分類（メンテナンス用） | 本ドキュメント参照 |

---

## 全体フロー

```mermaid
flowchart TB
    subgraph S1["① collect-races"]
        S1_IN[CHECK_TARGET_URLS] --> S1_OUT[(events: name, url 等)]
    end

    subgraph S4["④ orchestrator"]
        S4_SELECT[未処理レースを選定] --> S4_DISPATCH[② と ③ を並列呼び出し]
        S4_DISPATCH --> S4_LOOP[ループ]
        S4_LOOP --> S4_SELECT
    end

    subgraph S2["② enrich-detail"]
        S2_PASS0{"パス0: race_type 再分類\n(other の場合のみ)"}
        S2_FETCH[パス1: 公式ページ取得] --> S2_LLM[LLM 抽出]
        S2_LLM --> S2_PASS0
        S2_PASS0 --> S2_WRITE[(events / categories 更新)]
    end

    subgraph S3["③ enrich-logi"]
        S3_FETCH[アクセス・宿泊情報取得] --> S3_WRITE[(access_routes / accommodations 更新)]
    end

    S1_OUT --> S4_SELECT
    S4_DISPATCH --> S2_FETCH
    S4_DISPATCH --> S3_FETCH
```

---

## 実行順序

```bash
# 1. レース名収集
npm run crawl:collect

# 2. 詳細・ロジ収集（オーケストレータ経由）
npm run crawl:orchestrate
```

---

## 関連ドキュメント

- [SPEC_CRAWL_COLLECT_RACES.md](./SPEC_CRAWL_COLLECT_RACES.md)
- [SPEC_CRAWL_ENRICH_DETAIL.md](./SPEC_CRAWL_ENRICH_DETAIL.md)
- [SPEC_CRAWL_ENRICH_LOGI.md](./SPEC_CRAWL_ENRICH_LOGI.md)
- [SPEC_CRAWL_ORCHESTRATOR.md](./SPEC_CRAWL_ORCHESTRATOR.md)
- [SPEC_DATA_SOURCES.md](./SPEC_DATA_SOURCES.md)
- [SPEC_RACE_DATA.md](./SPEC_RACE_DATA.md)
