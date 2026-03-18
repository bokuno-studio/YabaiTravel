-- #192: enrichリトライ戦略の精緻化（エラー種別カラム追加）

ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS last_error_type TEXT
  CHECK (last_error_type IN ('temporary', 'not_available', 'bug'));

ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS last_error_type TEXT
  CHECK (last_error_type IN ('temporary', 'not_available', 'bug'));
