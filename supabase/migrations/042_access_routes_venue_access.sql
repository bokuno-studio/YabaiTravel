-- #325: venue_access origin_type 対応
-- origin_type に 'venue_access' を追加（既存 'tokyo'/'nearest_airport' に加えて）
-- NOT NULL DEFAULT 制約は既に migration 021 で設定済み

-- 既存データのバックフィル（origin_type が NULL のレコードがあれば tokyo に設定）
UPDATE yabai_travel.access_routes SET origin_type = 'tokyo' WHERE origin_type IS NULL;
UPDATE yabai_travel_staging.access_routes SET origin_type = 'tokyo' WHERE origin_type IS NULL;
