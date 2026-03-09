-- 開催国を追加

set search_path to yabai_travel, public;

alter table events add column if not exists country text;
