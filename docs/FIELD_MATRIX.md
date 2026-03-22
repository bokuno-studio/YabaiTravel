# 詳細ページ表示項目 × 取得バッチ対応表

## 1. 全表示項目とデータソースの対応

詳細ページ（EventDetail / CategoryDetail）に表示される全項目と、どのバッチが取得しているかの対応。

### イベント単位の項目（events テーブル）

| # | 必須 | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|:----:|---------|---------|-----------|------|
| E1 | **○** | イベント名 | name / name_en | ① collect → ②-A enrich-event で更新 | ①で初期値、②-Aで正式名に更新 |
| E2 | **○** | 説明文 | description / description_en | ②-A enrich-event | |
| E3 | **○** | 開催日 | event_date / event_date_end | ②-A enrich-event | |
| E4 | **○** | 開催地 | location / location_en | ②-A enrich-event | |
| E5 | **○** | レース種別 | race_type | ②-A enrich-event | |
| E6 | **○** | 公式URL | official_url | ① collect → ②-A で更新の場合あり | |
| E7 | **○** | エントリーURL | entry_url | ②-A enrich-event | |
| E8 | | エントリー方式 | entry_type | ②-A enrich-event | 抽選/先着 |
| E9 | | 参加資格 | required_qualification / _en | ②-A enrich-event | |
| E10 | **○** | エントリー開始日 | entry_start | ②-A enrich-event | |
| E11 | **○** | エントリー締切日 | entry_end | ②-A enrich-event | |
| E12 | | 参加者数 | participant_count | ②-A enrich-event | |
| E13 | | 宿泊要否 | stay_status | ②-A enrich-event | カテゴリ側にもあり（フォールバック） |
| E14 | | 天気予報 | weather_forecast / _en | ②-A enrich-event | |
| E15 | | ビザ情報 | visa_info / _en | ②-A enrich-event | |
| E16 | | リカバリー施設 | recovery_facilities / _en | ②-A enrich-event | |
| E17 | | フォトスポット | photo_spots / _en | ②-A enrich-event | |
| E18 | | 禁止事項 | prohibited_items / _en | ②-A enrich-event | |
| E19 | | ふるさと納税URL | furusato_nozei_url | 手動入力 | バッチ対象外 |
| E20 | **○** | 合計コスト見積もり | total_cost_estimate / _en | ②-A enrich-event | |

※ 旧「典型的エントリー開始日/締切日」は廃止（過去開催のリンクで代替予定）

### カテゴリ単位の項目（categories テーブル）

| # | 必須 | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|:----:|---------|---------|-----------|------|
| C1 | **○** | カテゴリ名 | name / name_en | ②-A enrich-event | コース一覧から INSERT |
| C2 | **○** | 距離 | distance_km | ②-A enrich-event → ②-B で更新 | ②-Aで初期値、②-Bで精査 |
| C3 | **○** | 参加費 | entry_fee / entry_fee_currency | ②-B enrich-category-detail | |
| C4 | | 制限時間 | time_limit | ②-B enrich-category-detail | 種別テンプレートで必須化可能 |
| C5 | | スタート時間 | start_time | ②-B enrich-category-detail | 種別テンプレートで必須化可能 |
| C6 | | 受付締切 | reception_end | ②-B enrich-category-detail | |
| C7 | | 受付場所 | reception_place / _en | ②-B enrich-category-detail | events からフォールバック |
| C8 | **○** | スタート地点 | start_place / _en | ②-B enrich-category-detail | events からフォールバック |
| C9 | | 累積標高 | elevation_gain | ②-B enrich-category-detail | 種別テンプレートで必須化可能 |
| C10 | | 必携品 | mandatory_gear / _en | ②-B enrich-category-detail | 種別テンプレートで必須化可能 |
| C11 | | 推奨装備 | recommended_gear / _en | ②-B enrich-category-detail | |
| C12 | | 禁止事項 | prohibited_items / _en | ②-B enrich-category-detail | |
| C13 | | ポール可否 | poles_allowed | ②-B enrich-category-detail | |
| C14 | | 関門情報 | cutoff_times | ②-B enrich-category-detail | 種別テンプレートで必須化可能。JSON配列 |
| C15 | | 必要ペース | required_pace / _en | ②-B enrich-category-detail | NULL時は time_limit÷distance で算出表示 |
| C16 | | 必要登りペース | required_climb_pace / _en | ②-B enrich-category-detail | |
| C17 | | 完走率 | finish_rate | ②-B enrich-category-detail | |
| C18 | | ITRAポイント | itra_points | ②-B enrich-category-detail | |
| C19 | | 宿泊要否 | stay_status | ②-B enrich-category-detail | events からフォールバック |

### アクセス情報（access_routes テーブル）

| # | 必須 | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|:----:|---------|---------|-----------|------|
| A1 | **○** | 経路詳細 | route_detail / _en | ③ enrich-logi | 往路/復路別 |
| A2 | **○** | 所要時間 | total_time_estimate | ③ enrich-logi | |
| A3 | **○** | 交通費 | cost_estimate | ③ enrich-logi | |
| A4 | **○** | 公共交通アクセス可否 | transit_accessible | ③ enrich-logi | |
| A5 | | シャトルバス情報 | shuttle_available / _en | ③ enrich-logi | |
| A6 | | タクシー見積もり | taxi_estimate | ③ enrich-logi | |
| A7 | | 予約URL | booking_url | ③ enrich-logi | |
| A8 | | 現金必要 | cash_required | ③ enrich-logi | |

### 宿泊情報（accommodations テーブル）

| # | 必須 | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|:----:|---------|---------|-----------|------|
| H1 | **○** | 推奨エリア | recommended_area / _en | ③ enrich-logi | |
| H2 | **○** | 宿泊費目安 | avg_cost_3star | ③ enrich-logi | 3つ星基準 |

### 地図情報（未実装）

| # | 必須 | 表示項目 | DBカラム | 取得バッチ | 備考 |
|---|:----:|---------|---------|-----------|------|
| M1 | **○** | スタート地点マーカー | 未定（start_latitude/longitude） | ②-B or ③ | 要カラム追加 |
| M2 | **○** | ゴール地点マーカー | 未定（goal_latitude/longitude） | ②-B or ③ | 要カラム追加 |
| M3 | **○** | アクセスルート（公共交通） | 未定（route_geometry） | ③ enrich-logi | タクシー除く。要カラム追加 |
| M4 | **○** | 宿泊推奨地マーカー | 未定（accommodation_lat/lng） | ③ enrich-logi | 要カラム追加 |

---

## 2. 必須フィールドテンプレート

フォールバック（関連ページ・Tavily）と成功判定に使用する必須フィールドの定義。

### 仕組み

```
種別テンプレート（race_type ごとの必須カラム名リスト）
  ↓ マージ（和集合）
共通テンプレート（全種別共通の必須カラム名リスト）
  ↓
最終必須リスト = 共通 ∪ 種別
```

- テンプレートは「必須カラム名を列挙するだけ」の追加方式
- テンプレートに載っていないカラム = 任意（公式ページ1回で取れれば保存、取れなければ NULL）
- 種別テンプレートを持たない新種別は共通テンプレートのみ適用
- 必須項目を増やしたい場合は、該当テンプレートにカラム名を追加するだけ

### 共通テンプレート（②-B カテゴリ詳細）

```
entry_fee, start_place
```

### 種別テンプレート（別チケットで順次検討・追加）

各種別で追加すべき必須フィールドは別チケットで検討。以下は参考の初期案:

| race_type | 追加必須候補（検討対象） |
|-----------|----------------------|
| trail | time_limit, elevation_gain, mandatory_gear, cutoff_times |
| marathon | time_limit, start_time |
| adventure | time_limit, mandatory_gear, cutoff_times |
| bike | time_limit, start_time, elevation_gain |
| triathlon | time_limit, start_time |
| rogaining | time_limit, mandatory_gear |
| spartan | （距離による分岐が必要。別チケットで検討） |

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

### 備考

- **spartan**: 通常は短距離OCRだが、Ultra/Trail(50km+)カテゴリではtrailと同等の項目が必要（elevation_gain, cutoff_times, mandatory_gear）
- **hyrox**: wave start方式のため start_time は「09:00-15:00」のような範囲。個人のスロットは不明なため N/A 扱い
- **adventure**: 長距離の性質上、持久系と同様に time_limit, cutoff_times, mandatory_gear が重要
- **rogaining**: 制限時間が競技の核（3h/6h/12h/24h等）。地図・コンパスが必携品
- **marathon 160km**: ultra_marathon相当だが race_type=marathon になっている。距離ベースの判定が必要
- **距離による分岐が必要なケース**: spartan Ultra、marathon のウルトラ距離など。race_type だけでは判定できず、distance_km との掛け合わせが必要
