-- #16, #17: エントリ種別、参加資格、ITRA、去年のレースURL

set search_path to yabai_travel, public;

-- events: エントリ種別、参加資格、去年のレースURL
alter table events add column if not exists entry_type text;  -- 'lottery' | 'first_come'
alter table events add column if not exists required_qualification text;
alter table events add column if not exists previous_edition_url text;

-- categories: ITRA（トレラン用）
alter table categories add column if not exists itra_points text;
