-- #78: 多言語対応（日本語/英語）のDB基盤
-- テキストフィールドに _en カラムを追加
-- access_routes に origin_type を追加（tokyo / nearest_airport）

-- events: 場所・国の英語表記
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS location_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS country_en TEXT;

-- access_routes: 起点種別（東京 or 最寄り空港）
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL DEFAULT 'tokyo';
-- 空港起点の場合に使う追加カラム
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS origin_name TEXT;
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS origin_airport_code TEXT;

-- accommodations: 推奨エリアの英語表記
ALTER TABLE yabai_travel.accommodations ADD COLUMN IF NOT EXISTS recommended_area_en TEXT;

-- staging にも適用
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS location_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS country_en TEXT;

ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS origin_type TEXT NOT NULL DEFAULT 'tokyo';
ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS origin_name TEXT;
ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS origin_airport_code TEXT;

ALTER TABLE yabai_travel_staging.accommodations ADD COLUMN IF NOT EXISTS recommended_area_en TEXT;
