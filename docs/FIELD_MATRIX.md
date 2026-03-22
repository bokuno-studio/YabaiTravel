# 詳細ページ表示項目 × 取得バッチ対応表

## 1. 全表示項目とデータソースの対応

詳細ページ（EventDetail / CategoryDetail）に表示される全項目と、どのバッチが取得しているかの対応。
必須と判断した項目の番号をチャットで伝えてください。

### イベント単位の項目（events テーブル）

| # | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|---------|---------|-----------|------|
| E1 | イベント名 | name / name_en | ① collect → ②-A enrich-event で更新 | ①で初期値、②-Aで正式名に更新 |
| E2 | 説明文 | description / description_en | ②-A enrich-event | |
| E3 | 開催日 | event_date / event_date_end | ②-A enrich-event | |
| E4 | 開催地 | location / location_en | ②-A enrich-event | |
| E5 | レース種別 | race_type | ②-A enrich-event | |
| E6 | 公式URL | official_url | ① collect → ②-A で更新の場合あり | |
| E7 | エントリーURL | entry_url | ②-A enrich-event | |
| E8 | エントリー方式 | entry_type | ②-A enrich-event | 抽選/先着 |
| E9 | 参加資格 | required_qualification / _en | ②-A enrich-event | |
| E10 | エントリー開始日 | entry_start | ②-A enrich-event | |
| E11 | エントリー締切日 | entry_end | ②-A enrich-event | |
| E12 | 典型的エントリー開始日 | entry_start_typical | ②-A enrich-event | |
| E13 | 典型的エントリー締切日 | entry_end_typical | ②-A enrich-event | |
| E14 | 参加者数 | participant_count | ②-A enrich-event | |
| E15 | 宿泊要否 | stay_status | ②-A enrich-event | カテゴリ側にもあり（フォールバック） |
| E16 | 天気予報 | weather_forecast / _en | ②-A enrich-event | |
| E17 | ビザ情報 | visa_info / _en | ②-A enrich-event | |
| E18 | リカバリー施設 | recovery_facilities / _en | ②-A enrich-event | |
| E19 | フォトスポット | photo_spots / _en | ②-A enrich-event | |
| E20 | 禁止事項 | prohibited_items / _en | ②-A enrich-event | |
| E21 | ふるさと納税URL | furusato_nozei_url | 手動入力 | バッチ対象外 |
| E22 | 合計コスト見積もり | total_cost_estimate / _en | ②-A enrich-event | |

### カテゴリ単位の項目（categories テーブル）

| # | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|---------|---------|-----------|------|
| C1 | カテゴリ名 | name / name_en | ②-A enrich-event | コース一覧から INSERT |
| C2 | 距離 | distance_km | ②-A enrich-event → ②-B で更新 | ②-Aで初期値、②-Bで精査 |
| C3 | 参加費 | entry_fee / entry_fee_currency | ②-B enrich-category-detail | |
| C4 | 制限時間 | time_limit | ②-B enrich-category-detail | |
| C5 | スタート時間 | start_time | ②-B enrich-category-detail | |
| C6 | 受付締切 | reception_end | ②-B enrich-category-detail | |
| C7 | 受付場所 | reception_place / _en | ②-B enrich-category-detail | events からフォールバック |
| C8 | スタート地点 | start_place / _en | ②-B enrich-category-detail | events からフォールバック |
| C9 | 累積標高 | elevation_gain | ②-B enrich-category-detail | |
| C10 | 必携品 | mandatory_gear / _en | ②-B enrich-category-detail | |
| C11 | 推奨装備 | recommended_gear / _en | ②-B enrich-category-detail | |
| C12 | 禁止事項 | prohibited_items / _en | ②-B enrich-category-detail | |
| C13 | ポール可否 | poles_allowed | ②-B enrich-category-detail | |
| C14 | 関門情報 | cutoff_times | ②-B enrich-category-detail | JSON配列 |
| C15 | 必要ペース | required_pace / _en | ②-B enrich-category-detail | NULL時は time_limit÷distance で算出表示 |
| C16 | 必要登りペース | required_climb_pace / _en | ②-B enrich-category-detail | |
| C17 | 完走率 | finish_rate | ②-B enrich-category-detail | |
| C18 | ITRAポイント | itra_points | ②-B enrich-category-detail | |
| C19 | 宿泊要否 | stay_status | ②-B enrich-category-detail | events からフォールバック |

### アクセス情報（access_routes テーブル）

| # | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|---------|---------|-----------|------|
| A1 | 経路詳細 | route_detail / _en | ③ enrich-logi | 往路/復路別 |
| A2 | 所要時間 | total_time_estimate | ③ enrich-logi | |
| A3 | 交通費 | cost_estimate | ③ enrich-logi | |
| A4 | 公共交通アクセス可否 | transit_accessible | ③ enrich-logi | |
| A5 | シャトルバス情報 | shuttle_available / _en | ③ enrich-logi | |
| A6 | タクシー見積もり | taxi_estimate | ③ enrich-logi | |
| A7 | 予約URL | booking_url | ③ enrich-logi | |
| A8 | 現金必要 | cash_required | ③ enrich-logi | |

### 宿泊情報（accommodations テーブル）

| # | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|---------|---------|-----------|------|
| H1 | 推奨エリア | recommended_area / _en | ③ enrich-logi | |
| H2 | 宿泊費目安 | avg_cost_3star | ③ enrich-logi | 3つ星基準 |

---

## 2. レース種別ごとの項目要否

②-Bで取得するカテゴリ項目について、レース種別ごとに取得する意味があるかを整理。

凡例:
- **必須**: そのレース種別で重要。丁寧に取りに行く（関連ページ・Tavily フォールバック対象）
- **任意**: あれば表示。公式ページ1回で取れなければ NULL 許容
- **N/A**: そのレース種別では構造的に存在しない or 意味がない

### カテゴリ数と距離レンジ（参考）

| race_type | カテゴリ数 | 距離レンジ |
|-----------|----------|-----------|
| trail | 507 | 1-330km |
| marathon | 479 | 0.05-160km |
| spartan | 355 | 0.1-322km |
| hyrox | 212 | 8-50km |
| adventure | 102 | 22.5-500km |
| bike | 96 | 0.9-170km |
| triathlon | 52 | 0.95-236km |
| rogaining | 49 | - |
| tough_mudder | 34 | 5-24km |
| strong_viking | 31 | 4-60km |
| obstacle | 10 | 1.6-42km |

### 項目 × 種別マトリクス

| 項目 | trail | marathon | spartan | hyrox | adventure | bike | triathlon | tough_mudder | strong_viking | rogaining |
|------|-------|----------|---------|-------|-----------|------|-----------|-------------|---------------|-----------|
| **C3 entry_fee** | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| **C4 time_limit** | 必須 | 必須 | 任意 | N/A | 必須 | 必須 | 必須 | N/A | 任意 | 必須(制限時間=競技時間) |
| **C5 start_time** | 必須 | 必須 | 任意(wave) | N/A(wave) | 必須 | 必須 | 必須 | 任意(wave) | 任意(wave) | 必須 |
| **C9 elevation_gain** | 必須 | N/A | 任意(Ultra時必須) | N/A | 任意 | 必須 | N/A | N/A | N/A | N/A |
| **C10 mandatory_gear** | 必須 | N/A | N/A | N/A | 必須 | 任意 | 任意 | N/A | N/A | 必須(地図等) |
| **C14 cutoff_times** | 必須(長距離) | 任意 | N/A | N/A | 必須 | 任意 | 任意 | N/A | N/A | N/A |
| **C13 poles_allowed** | 任意 | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **C18 itra_points** | 任意 | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| **C6 reception_end** | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 |
| **C17 finish_rate** | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 |
| **C15 required_pace** | 任意 | 任意 | N/A | N/A | 任意 | 任意 | 任意 | N/A | N/A | N/A |
| **C16 required_climb_pace** | 任意 | N/A | N/A | N/A | 任意 | N/A | N/A | N/A | N/A | N/A |
| **C11 recommended_gear** | 任意 | N/A | N/A | N/A | 任意 | 任意 | 任意 | N/A | N/A | 任意 |
| **C12 prohibited_items** | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 |
| **C7 start_place** | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 |
| **C8 reception_place** | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 | 任意 |

### 備考

- **spartan**: 通常は短距離OCRだが、Ultra/Trail(50km+)カテゴリではtrailと同等の項目が必要（elevation_gain, cutoff_times, mandatory_gear）
- **hyrox**: wave start方式のため start_time は「09:00-15:00」のような範囲。個人のスロットは不明なため N/A 扱い
- **adventure**: 長距離の性質上、持久系と同様に time_limit, cutoff_times, mandatory_gear が重要
- **rogaining**: 制限時間が競技の核（3h/6h/12h/24h等）。地図・コンパスが必携品
- **marathon 160km**: ultra_marathon相当だが race_type=marathon になっている。距離ベースの判定が必要
- **距離による分岐が必要なケース**: spartan Ultra、marathon のウルトラ距離など。race_type だけでは判定できず、distance_km との掛け合わせが必要
