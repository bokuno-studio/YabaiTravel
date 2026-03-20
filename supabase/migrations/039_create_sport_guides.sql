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

CREATE POLICY "Anyone can read sport guides"
  ON yabai_travel.sport_guides
  FOR SELECT
  USING (true);
