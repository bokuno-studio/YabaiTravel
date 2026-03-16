-- #148: 多言語対応 — 全テキストフィールドに _en カラム追加

-- events（location_en, country_en は migration 021 で追加済み）
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS weather_forecast_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS reception_place_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS start_place_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS prohibited_items_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS total_cost_estimate_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS required_qualification_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS visa_info_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS recovery_facilities_en TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS photo_spots_en TEXT;

-- categories
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS reception_place_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS start_place_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS required_pace_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS required_climb_pace_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS mandatory_gear_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS recommended_gear_en TEXT;
ALTER TABLE yabai_travel.categories ADD COLUMN IF NOT EXISTS prohibited_items_en TEXT;

-- access_routes
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS route_detail_en TEXT;
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS shuttle_available_en TEXT;
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS origin_name_en TEXT;

-- staging にも適用
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS weather_forecast_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS reception_place_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS start_place_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS prohibited_items_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS total_cost_estimate_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS required_qualification_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS visa_info_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS recovery_facilities_en TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS photo_spots_en TEXT;

ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS reception_place_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS start_place_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS required_pace_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS required_climb_pace_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS mandatory_gear_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS recommended_gear_en TEXT;
ALTER TABLE yabai_travel_staging.categories ADD COLUMN IF NOT EXISTS prohibited_items_en TEXT;

ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS route_detail_en TEXT;
ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS shuttle_available_en TEXT;
ALTER TABLE yabai_travel_staging.access_routes ADD COLUMN IF NOT EXISTS origin_name_en TEXT;
