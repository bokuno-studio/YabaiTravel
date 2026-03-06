-- カテゴリにステイタス（宿泊）を追加（カテゴリ毎に異なる場合があるため）

set search_path to yabai_travel, public;

alter table categories add column if not exists stay_status text;
