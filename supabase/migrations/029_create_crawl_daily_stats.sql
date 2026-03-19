-- #222: デイリーレポート用の統計スナップショットテーブル

CREATE TABLE IF NOT EXISTS yabai_travel.crawl_daily_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  total_events INT NOT NULL DEFAULT 0,
  total_categories INT NOT NULL DEFAULT 0,
  enriched_events INT NOT NULL DEFAULT 0,
  enriched_categories INT NOT NULL DEFAULT 0,
  access_routes_count INT NOT NULL DEFAULT 0,
  accommodations_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yabai_travel_staging.crawl_daily_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  total_events INT NOT NULL DEFAULT 0,
  total_categories INT NOT NULL DEFAULT 0,
  enriched_events INT NOT NULL DEFAULT 0,
  enriched_categories INT NOT NULL DEFAULT 0,
  access_routes_count INT NOT NULL DEFAULT 0,
  accommodations_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
