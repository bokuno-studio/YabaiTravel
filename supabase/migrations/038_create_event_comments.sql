CREATE TABLE IF NOT EXISTS yabai_travel.event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  category_id UUID,
  user_id UUID,
  content TEXT NOT NULL,
  payment_id TEXT,
  race_type TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_comments_category ON yabai_travel.event_comments(category_id);
CREATE INDEX IF NOT EXISTS idx_event_comments_event ON yabai_travel.event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_comments_race_type ON yabai_travel.event_comments(race_type);
ALTER TABLE yabai_travel.event_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read event comments' AND tablename = 'event_comments') THEN
    CREATE POLICY "Anyone can read event comments" ON yabai_travel.event_comments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can insert event comments' AND tablename = 'event_comments') THEN
    CREATE POLICY "Anyone can insert event comments" ON yabai_travel.event_comments FOR INSERT WITH CHECK (true);
  END IF;
END $$;
GRANT SELECT, INSERT ON yabai_travel.event_comments TO anon, authenticated, service_role;
