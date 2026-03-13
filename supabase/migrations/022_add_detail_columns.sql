-- #77: 詳細ページ表示項目拡充（天候・ビザ・リカバリー・フォトスポット）

-- events: ビザ情報、リカバリー施設、フォトスポット
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS visa_info TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS recovery_facilities TEXT;
ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS photo_spots TEXT;

-- staging にも適用
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS visa_info TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS recovery_facilities TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS photo_spots TEXT;
