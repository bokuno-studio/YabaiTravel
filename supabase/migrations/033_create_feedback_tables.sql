-- Feedbacks
CREATE TABLE IF NOT EXISTS yabai_travel.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- NULL = anonymous
  content TEXT NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'feature',  -- feature, bug
  status TEXT NOT NULL DEFAULT 'new',  -- new, linked, in_progress, resolved
  ai_confidence REAL,
  ai_reason TEXT,
  github_issue_url TEXT,
  github_issue_number INTEGER,
  source_url TEXT,
  channel TEXT NOT NULL DEFAULT 'web',
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Votes (one per user per feedback)
CREATE TABLE IF NOT EXISTS yabai_travel.feedback_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES yabai_travel.feedbacks(id) ON DELETE CASCADE,
  user_id UUID,  -- NULL for anonymous votes (use voter_id)
  voter_id TEXT,  -- localStorage-based ID for anonymous users
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(feedback_id, user_id),
  UNIQUE(feedback_id, voter_id)
);

-- Comments (supporters only - enforced by RLS)
CREATE TABLE IF NOT EXISTS yabai_travel.feedback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES yabai_travel.feedbacks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON yabai_travel.feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON yabai_travel.feedbacks(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON yabai_travel.feedbacks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_votes_fid ON yabai_travel.feedback_votes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_fid ON yabai_travel.feedback_comments(feedback_id);

-- RLS
ALTER TABLE yabai_travel.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE yabai_travel.feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE yabai_travel.feedback_comments ENABLE ROW LEVEL SECURITY;

-- Feedbacks: anyone can read feature feedbacks, anyone can insert
CREATE POLICY "Anyone can read feature feedbacks"
  ON yabai_travel.feedbacks FOR SELECT
  USING (feedback_type = 'feature');

CREATE POLICY "Anyone can insert feedbacks"
  ON yabai_travel.feedbacks FOR INSERT
  WITH CHECK (true);

-- Votes: anyone can read and insert
CREATE POLICY "Anyone can read votes"
  ON yabai_travel.feedback_votes FOR SELECT USING (true);

CREATE POLICY "Anyone can vote"
  ON yabai_travel.feedback_votes FOR INSERT WITH CHECK (true);

-- Comments: anyone can read, only authenticated users can insert
CREATE POLICY "Anyone can read comments"
  ON yabai_travel.feedback_comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON yabai_travel.feedback_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Grant access
GRANT SELECT, INSERT ON yabai_travel.feedbacks TO anon, authenticated;
GRANT SELECT, INSERT ON yabai_travel.feedback_votes TO anon, authenticated;
GRANT SELECT, INSERT ON yabai_travel.feedback_comments TO anon, authenticated;
