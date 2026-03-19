CREATE TABLE IF NOT EXISTS yabai_travel.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, cancelled, expired
  plan TEXT NOT NULL DEFAULT 'community',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON yabai_travel.subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON yabai_travel.subscriptions(stripe_customer_id);
