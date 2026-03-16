-- #151: イベント紹介文カラム追加

ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS description_en TEXT;

ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS description_en TEXT;
