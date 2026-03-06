-- クロール変更検知用スナップショット（系統A）

set search_path to yabai_travel, public;

create table if not exists crawl_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  content_hash text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_crawl_snapshots_source_url on crawl_snapshots(source_url);
