-- #157: 地図表示用の緯度経度カラム追加

ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
