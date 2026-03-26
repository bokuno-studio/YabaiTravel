-- スポーツガイドのコンテンツを格納するテーブル
CREATE TABLE IF NOT EXISTS yabai_travel.sport_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_key TEXT NOT NULL UNIQUE,
  content_ja JSONB,
  content_en JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT ON yabai_travel.sport_guides TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON yabai_travel.sport_guides TO service_role;

ALTER TABLE yabai_travel.sport_guides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'yabai_travel' AND tablename = 'sport_guides' AND policyname = 'Anyone can read sport guides'
  ) THEN
    CREATE POLICY "Anyone can read sport guides"
      ON yabai_travel.sport_guides
      FOR SELECT
      USING (true);
  END IF;
END $$;
