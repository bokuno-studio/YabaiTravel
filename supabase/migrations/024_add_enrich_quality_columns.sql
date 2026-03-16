-- #142: enrich品質ゲート用カラム追加

-- events: リトライ回数・品質フラグ
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS enrich_attempt_count INTEGER DEFAULT 0;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS enrich_quality TEXT;

-- staging にも適用
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS enrich_attempt_count INTEGER DEFAULT 0;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS enrich_quality TEXT;
