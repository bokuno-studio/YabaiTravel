# レースデータ取得品質 改善サマリ（2026-03）

## 実施内容

### 1. evaluate-extraction.js の作成

- **パス**: `scripts/crawl/evaluate-extraction.js`
- **処理**: DB の全 events を読み、各 official_url の詳細ページを fetch し、期待項目を抽出して DB 値と比較
- **出力**: `scripts/crawl/evaluation-result.json`
- **期待項目**:
  - events: name, event_date, location, official_url, entry_url, race_type, participant_count, entry_start, entry_end, reception_place, start_place, prohibited_items, country, total_cost_estimate
  - categories: name, elevation_gain, distance_km, entry_fee, start_time, time_limit, mandatory_gear
  - access_routes: direction, route_detail, total_time_estimate, cost_estimate
  - accommodations: recommended_area, avg_cost_3star

### 2. extract-a-extremo-detail.js の拡張

- **追加項目**: entry_end（応募締切日）, reception_place（受付）, start_place（会場）, start_time（スタート時刻）
- **既存**: distance_km, entry_fee, route_detail

### 3. junkNames の強化

- **追加パターン**: OCR World Champs, SPARTAN TRAIL
- **追加正規表現**:
  - `^エントリー\s*\d{4}\.\d{2}\.\d{2}` … RUNNET「エントリー 2026.03.02 忘れてませんか？」
  - `^【スポーツの話題はこちら】` … スポーツエントリー プレスリリース
  - `TICKET PRICES RISE.*REGISTER NOW` … Tough Mudder バナー
  - `^プレスリリース$` … プレスリリースリンク

### 4. Devils Circuit 誤抽出の修正

- **問題**: DC Dubai が「DC Dubai, India」と誤っていた
- **修正**: Dubai 系は「Dubai, UAE」、他都市は「都市名, India」
- **名前**: DC Dubai → Devils Circuit Dubai

### 5. categories / access_routes / accommodations の投入

- **fetch-one-per-source.js** に以下を追加:
  - **categories**: distance_km, entry_fee, elevation_gain, time_limit, start_time のいずれかがあれば INSERT
  - **access_routes**: route_detail があれば direction=outbound で INSERT
  - **accommodations**: recommended_area または avg_cost_3star があれば INSERT
- **events**: entry_end, reception_place, start_place を INSERT に追加

## 評価結果（改善後）

- **総イベント数**: 34
- **official_url あり**: 34
- **ゴミ候補**: 2（TICKET PRICES RISE, エントリー忘れてませんか）
- **categories**: 21 件
- **access_routes**: 7 件
- **accommodations**: 2 件

## 残ギャップ（技術的にこれ以上取れない／要別施策）

| 項目 | 状況 |
|------|------|
| participant_count | ほぼ全件未取得。公式サイトに掲載されていないことが多い |
| entry_start | 多くのソースで未掲載 |
| entry_end | A-Extremo 詳細で取得可能。他ソースは要個別対応 |
| reception_place, start_place | A-Extremo で取得。他はページ構造が多様で汎用抽出困難 |
| prohibited_items | 一部のみ。ページ内に散在 |
| country | 一部のみ。URL や location から推測可能な場合あり |
| total_cost_estimate | 申込費+交通+宿泊の合算。手動算出または別ソースが必要 |
| categories (elevation_gain, time_limit, mandatory_gear) | ソースにより構造が大きく異なり、個別 extractor が必要 |
| access_routes (total_time_estimate, cost_estimate) | 経路は取得可能な場合あり。時間・費用は別 API（例: 乗換案内）が必要 |
| accommodations | 前泊推奨地・費用は公式に少なく、別ソース（宿泊サイト等）が必要 |

## ゴミデータ削除

`node scripts/crawl/delete-junk-events.js` で以下を削除済み:
- TICKET PRICES RISE（Tough Mudder バナー）
- エントリー 2026.03.02 忘れてませんか（RUNNET 誤抽出）
- 【スポーツの話題はこちら】スポーツ関連プレスリリース（スポーツエントリー 誤抽出）

## 技術限界（これ以上 fetch のみでは取れない項目）

| 項目 | 理由 |
|------|------|
| participant_count | 公式サイトに掲載少ない |
| entry_start / entry_end | 多くのソースで未掲載 |
| total_cost_estimate | 申込費+交通+宿泊の算出が必要 |
| access_routes (total_time_estimate, cost_estimate) | 乗換案内 API 等の別ソースが必要 |
| accommodations (avg_cost_3star) | 宿泊サイト API 等が必要 |
| レース名で検索→詳細取得 | 生成AI または 検索API + スクレイピング が必要 |

**生成AI ベースの拡張案**: レース名で検索し、ヒットした公式ページの HTML を LLM に渡して構造化抽出。要 API キー・コスト。

## 今後の方針

1. **新規ソース追加時**: 専用 extract-*-detail.js を作成し、ページ構造に合わせて項目を取得
2. **event_date 2099**: 日付不明時のプレースホルダー。スキーマ上 NOT NULL のため、UI で「日付未定」表示する等の対応を検討
3. **RUNNET / スポーツエントリー**: ポータルサイトのため、個別ページへのリンク抽出が複雑。専用クローラーが必要
