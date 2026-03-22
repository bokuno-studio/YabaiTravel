-- #316: categories に attempt_count, last_error_type, last_error_message を追加
-- events の attempt_count も追加（既存の enrich_attempt_count → attempt_count に統一）

ALTER TABLE yabai_travel.categories
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_type TEXT,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- events にも attempt_count を追加（既存の enrich_attempt_count は残す、新しい統一名で追加）
ALTER TABLE yabai_travel.events
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- 既存の enrich_attempt_count の値を attempt_count にコピー（events）
UPDATE yabai_travel.events SET attempt_count = COALESCE(enrich_attempt_count, 0) WHERE attempt_count = 0 AND enrich_attempt_count > 0;
