-- access_routes に公共交通機関でのアクセス可否フラグを追加
ALTER TABLE yabai_travel.access_routes
  ADD COLUMN IF NOT EXISTS transit_accessible boolean;
