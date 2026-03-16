# ②-B カテゴリ詳細収集スクリプト設計

スクリプト: `scripts/crawl/enrich-category-detail.js`

---

## 役割

②-A `enrich-event.js` で特定されたコース（categories レコード）1件に対し、
公式ページから**そのコース固有の詳細情報**を focused に抽出する。

1カテゴリ1回の LLM 呼び出しで、精度の高い情報抽出を実現する。

---

## フロー

```mermaid
flowchart TB
    IN[event + category\nid, name, distance_km, official_url] --> FETCH

    subgraph FETCH["ステップ1: ページ取得"]
        F_CHECK{official_url あり?}
        F_CHECK --> |Yes| F_DIRECT[公式ページ取得]
        F_CHECK --> |No| F_TAVILY["Tavily 検索\n{イベント名} {カテゴリ名} {距離}km"]
    end

    FETCH --> LLM

    subgraph LLM["ステップ2: LLM 抽出（focused）"]
        L_EXTRACT["このコース固有の詳細を抽出\n参加費・制限時間・必携品等"]
    end

    LLM --> PASS2

    subgraph PASS2["ステップ3: 関連ページ補完"]
        P2_CHECK{高優先度項目が空?}
        P2_CHECK --> |Yes| P2_LINKS[/course, /rule, /entry ページを探索]
        P2_LINKS --> P2_LLM[追加 LLM 抽出]
        P2_CHECK --> |No| P2_SKIP[スキップ]
    end

    PASS2 --> WRITE

    subgraph WRITE["ステップ4: DB 書き込み"]
        W_UPDATE[categories テーブル COALESCE 更新\nnull フィールドのみ埋める]
    end
```

---

## LLM プロンプト（カテゴリ専用）

モデル: `claude-haiku-4-5-20251001`

### 抽出対象

```json
{
  "entry_fee": "数値（現地通貨、カンマなし）",
  "entry_fee_currency": "JPY|USD|EUR 等",
  "start_time": "HH:MM（wave start の場合は '09:00〜15:00' のように幅で表現）",
  "reception_end": "HH:MM",
  "time_limit": "HH:MM:SS",
  "cutoff_times": [{"point": "地点名", "time": "HH:MM"}],
  "elevation_gain": "数値（メートル）",
  "mandatory_gear": "必携品リスト",
  "poles_allowed": "true/false",
  "itra_points": "数値"
}
```

### LLM への指示

- このコース（{コース名}, {距離}km）に関する情報のみを抽出する
- ページに記載がない項目は null
- **wave start イベント（HYROX、スパルタン等）の扱い**:
  - `start_time`: 全 wave の時間幅で返す（例: "09:00〜15:00"）
  - `entry_fee`: 一般的なカテゴリの料金（最安 wave 等ではなく標準価格）
  - `time_limit`, `mandatory_gear` 等: wave 共通なのでそのまま抽出
- `entry_fee` は現地通貨の数値（¥5000 → 5000 + "JPY"）

### ユーザーメッセージ例

```
「第30回 京都一周トレイルラン＜東山コース＞」のロング(35km)コースについて、
以下のページ内容から詳細情報を抽出してください。

[ページ内容]
```

---

## DB 更新戦略

null フィールドのみ更新（既存値は上書きしない）:

```sql
UPDATE categories SET
  entry_fee          = COALESCE(entry_fee, $2),
  entry_fee_currency = COALESCE(entry_fee_currency, $3),
  start_time         = COALESCE(start_time, $4),
  reception_end      = COALESCE(reception_end, $5),
  time_limit         = COALESCE(time_limit, $6),
  cutoff_times       = CASE WHEN cutoff_times IS NULL OR cutoff_times = '[]'::jsonb THEN $7 ELSE cutoff_times END,
  elevation_gain     = COALESCE(elevation_gain, $8),
  mandatory_gear     = COALESCE(mandatory_gear, $9),
  poles_allowed      = COALESCE(poles_allowed, $10),
  itra_points        = COALESCE(itra_points, $11)
WHERE id = $1
```

---

## 処理対象の選定

オーケストレータから呼び出される際の対象:

```sql
SELECT id, name, distance_km
FROM categories
WHERE event_id = $1
  AND (entry_fee IS NULL OR start_time IS NULL OR time_limit IS NULL)
```

高優先度フィールド（entry_fee, start_time, time_limit）のいずれかが空のカテゴリのみ処理。

---

## コスト

| 項目 | 値 |
|------|-----|
| LLM 呼び出し | 1〜2回/カテゴリ（本体 + 関連ページ補完） |
| 想定トークン | 〜3,000/回 |
| Haiku コスト概算 | 〜$0.01/カテゴリ |

---

## 入出力

### 入力
```
node scripts/crawl/enrich-category-detail.js --event-id <uuid>    # イベントの全カテゴリ
node scripts/crawl/enrich-category-detail.js --category-id <uuid>  # 特定カテゴリ
node scripts/crawl/enrich-category-detail.js --dry-run             # DB更新なし
```

### 出力（DB）

| テーブル | 更新内容 |
|----------|----------|
| `categories` | 詳細フィールドを COALESCE UPDATE |

### 戻り値
```javascript
{ success: boolean, categoryId: string, error?: string }
```

---

## 関連ドキュメント

- [SPEC_CRAWL_ENRICH_EVENT.md](./SPEC_CRAWL_ENRICH_EVENT.md) — ②-A イベント情報・コース特定
- [SPEC_CRAWL_ORCHESTRATOR.md](./SPEC_CRAWL_ORCHESTRATOR.md) — ④ オーケストレータ
- [SPEC_BACKEND_FLOW.md](./SPEC_BACKEND_FLOW.md) — 全体フロー
