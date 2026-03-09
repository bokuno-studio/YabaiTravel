-- collect-races.js で event_date なしでも INSERT できるようにする
set search_path to yabai_travel, public;
ALTER TABLE events ALTER COLUMN event_date DROP NOT NULL;
