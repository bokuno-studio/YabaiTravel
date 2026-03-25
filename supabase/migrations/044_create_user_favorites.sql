CREATE TABLE IF NOT EXISTS yabai_travel.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES yabai_travel.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON yabai_travel.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_event ON yabai_travel.user_favorites(event_id);

ALTER TABLE yabai_travel.user_favorites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "Users can view own favorites" ON yabai_travel.user_favorites FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "Users can insert own favorites" ON yabai_travel.user_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "Users can delete own favorites" ON yabai_travel.user_favorites FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, DELETE ON yabai_travel.user_favorites TO authenticated;

-- Entry reminders (DB design only, no implementation)
CREATE TABLE IF NOT EXISTS yabai_travel.entry_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES yabai_travel.events(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

ALTER TABLE yabai_travel.entry_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own reminders' AND tablename = 'entry_reminders') THEN
    CREATE POLICY "Users can manage own reminders" ON yabai_travel.entry_reminders FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON yabai_travel.entry_reminders TO authenticated;
