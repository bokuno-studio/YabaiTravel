-- #324: start_time, reception_end を TIME → TEXT に変更
-- wave start の時間範囲（"08:00-20:30"）をそのまま保存するため
ALTER TABLE yabai_travel.categories ALTER COLUMN start_time TYPE TEXT;
ALTER TABLE yabai_travel.categories ALTER COLUMN reception_end TYPE TEXT;
