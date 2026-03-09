-- カテゴリに距離（km）を追加

set search_path to yabai_travel, public;

alter table categories add column if not exists distance_km numeric;
