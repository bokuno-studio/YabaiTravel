-- #332: 地図表示用カラム追加

-- accommodations: 宿泊候補の座標
ALTER TABLE yabai_travel.accommodations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE yabai_travel.accommodations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- access_routes: 空港・駅の座標 + ルート線描画用polyline
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE yabai_travel.access_routes ADD COLUMN IF NOT EXISTS route_polyline TEXT;
