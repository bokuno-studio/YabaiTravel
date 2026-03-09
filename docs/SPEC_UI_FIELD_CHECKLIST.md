# 画面表示項目チェックリスト（SPEC_RACE_DATA 準拠）

CategoryDetail で表示すべき項目と SPEC_RACE_DATA の対応。

**検証ルール**: 変更後は必ず ec756b6 の CategoryDetail と比較し、全項目が復元されていることを確認すること。「完璧です」と断言する前に、実際の seed データで表示確認を行うこと。

## 大会単位

| SPEC 項目 | DB/型 | 表示箇所 | 状態 |
|------------|-------|----------|------|
| 大会名 | event.name | header | ✓ |
| 日付 | event.event_date | header | ✓ |
| 場所 | event.location | header | ✓ |
| 申込みサイトURL | event.entry_url | header links | ✓ |
| 公式URL | event.official_url | header links | ✓ |
| レースの種類 | event.race_type | badges | ✓ |
| 大会規模 | event.participant_count | — | **要追加** |
| 例年の天気 | event.weather_history | その他 | ✓ |
| 今年の天気予報 | event.weather_forecast | その他 | ✓ |
| エントリ種別 | event.entry_type | 申込み | ✓ |
| 参加資格 | event.required_qualification | 申込み | ✓ |
| 申込み開始 | event.entry_start | 申込み | ✓ |
| 申込み終了 | event.entry_end | 申込み | ✓ |
| 例年の申込み開始・終了 | event.entry_start_typical, entry_end_typical | 申込み | ✓ |
| 経路・乗り換え（往路） | access_route.route_detail | アクセスの詳細 | ✓ |
| トータル時間（往路） | access_route.total_time_estimate | アクセスの詳細 | ✓ |
| 費用概算（往路） | access_route.cost_estimate | アクセスの詳細 | ✓ |
| 現金必須 | access_route.cash_required | アクセスの詳細 | ✓ |
| 予約サイトリンク | access_route.booking_url | アクセスの詳細 | ✓ |
| 前泊推奨地 | accommodation.recommended_area | 何日必要か | ✓ |
| 宿泊費用目安 | accommodation.avg_cost_3star | 宿泊費用 | ✓ |
| シャトルバス | access_route.shuttle_available | アクセスの詳細 | ✓ |
| タクシー | access_route.taxi_estimate | アクセスの詳細 | ✓ |
| 経路・乗り換え（復路） | access_route.route_detail | アクセスの詳細 | ✓ |
| トータル時間（復路） | access_route.total_time_estimate | アクセスの詳細 | ✓ |
| コースマップ | course_map_files, event.course_map_url | コースマップ | ✓ |
| トータル費用概算 | event.total_cost_estimate | トータルコスト | ✓ |
| 使用禁止品（大会共通） | event.prohibited_items | 使用禁止品 | ✓ |
| 去年のレースURL | event.previous_edition_url | 去年のレース | ✓ |
| ふるさと納税申込リンク | event.furusato_nozei_url | その他 | ✓ |

## カテゴリ単位

| SPEC 項目 | DB/型 | 表示箇所 | 状態 |
|------------|-------|----------|------|
| カテゴリ名 | category.name | header, nav | ✓ |
| 申込みの費用 | category.entry_fee | レーススペック, トータルコスト | ✓ |
| 獲得標高 | category.elevation_gain | header | ✓ |
| 距離 | category.distance_km | header | ✓ |
| スタート時間 | category.start_time | レーススペック | ✓ |
| 受付終了時間 | category.reception_end | レーススペック | ✓ |
| 受付場所 | category.reception_place | レーススペック | ✓ |
| スタート場所 | category.start_place | レーススペック | ✓ |
| 完走率 | category.finish_rate | レーススペック | ✓ |
| 制限時間 | category.time_limit | header | ✓ |
| カットオフタイム | category.cutoff_times | レーススペック | ✓ |
| 必要ペース | category.required_pace | レーススペック | ✓ |
| 必要クライムペース | category.required_climb_pace | レーススペック | ✓ |
| 必携品 | category.mandatory_gear | レーススペック | ✓ |
| 携行推奨品 | category.recommended_gear | レーススペック | ✓ |
| 使用禁止品（カテゴリ） | category.prohibited_items | レーススペック | ✓ |
| ポールの可否 | category.poles_allowed | レーススペック | ✓ |
| ITRA | category.itra_points | 申込み | ✓ |

## 補足

- **大会規模 (participant_count)**: header の基本情報に追加済み
- **受付場所・スタート場所**: カテゴリに無い場合は event をフォールバック表示
