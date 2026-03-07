-- コースマップをサイト内ファイルで保持、過去開催の紐付け、例年申込日を日付に

set search_path to yabai_travel, public;

-- 大会シリーズ（同一レースの複数年版を紐付ける）
create table if not exists event_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- events に event_series_id を追加
alter table events add column if not exists event_series_id uuid references event_series(id) on delete set null;

-- コースマップファイル（サイト内に保持。public/course-maps/ または Supabase Storage）
create table if not exists course_map_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  file_path text not null,  -- /course-maps/{event_id}/2024_course.pdf 等
  year integer,            -- どの年版のコースマップか（例: 2024）
  display_name text,        -- 表示用ラベル（例: "2024年コース"）
  created_at timestamptz default now()
);

create index if not exists idx_course_map_files_event_id on course_map_files(event_id);

-- 例年の申込日を具体的な日付で保持するため date 型に戻す
-- ::text にキャストしてから正規表現を使う（date 型は ~ 演算子不可）
alter table events alter column entry_start_typical type date using (
  case when entry_start_typical::text ~ '^\d{4}-\d{2}-\d{2}$' then entry_start_typical::text::date else null end
);
alter table events alter column entry_end_typical type date using (
  case when entry_end_typical::text ~ '^\d{4}-\d{2}-\d{2}$' then entry_end_typical::text::date else null end
);

-- トータル費用概算（申込費+交通+宿泊の合計目安）
alter table events add column if not exists total_cost_estimate text;

-- anon に新テーブルの SELECT を許可
GRANT SELECT ON yabai_travel.event_series TO anon;
GRANT SELECT ON yabai_travel.course_map_files TO anon;
