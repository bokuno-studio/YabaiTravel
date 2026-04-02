ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS idx_events_source ON yabai_travel.events(source);
