-- 複数日開催対応: 終日を追加（#29）

set search_path to yabai_travel, public;

alter table events add column if not exists event_date_end date;
