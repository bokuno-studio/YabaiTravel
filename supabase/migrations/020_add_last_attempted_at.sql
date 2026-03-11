-- #44: 再処理ループ防止のための last_attempted_at カラム追加
ALTER TABLE yabai_travel.events
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;
