-- 例年の申込み開始・終了は「11月上旬」等のテキストで格納するため text に変更

set search_path to yabai_travel, public;

alter table events alter column entry_start_typical type text using entry_start_typical::text;
alter table events alter column entry_end_typical type text using entry_end_typical::text;
