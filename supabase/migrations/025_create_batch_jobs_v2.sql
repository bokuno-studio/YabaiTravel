-- Create batch_jobs table for tracking Batch API jobs
CREATE TABLE IF NOT EXISTS yabai_travel.batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'completed' | 'expired' | 'failed'
  result_summary JSONB,           -- { succeeded, failed, errors, total }
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status_created ON yabai_travel.batch_jobs(status, created_at);
