-- events にステイタス（宿泊）判定を追加
-- day_trip: 日帰り可能 / pre_stay_required: 前泊必須 / post_stay_recommended: 後泊推奨

set search_path to yabai_travel, public;

alter table events add column if not exists stay_status text;
