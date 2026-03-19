CREATE TABLE IF NOT EXISTS yabai_travel.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',  -- new, replied, closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON yabai_travel.inquiries(status);
GRANT SELECT, INSERT ON yabai_travel.inquiries TO anon, authenticated, service_role;
