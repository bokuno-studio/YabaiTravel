-- Add Square-specific columns to user_profiles (migrating from Stripe naming)
ALTER TABLE yabai_travel.user_profiles
  ADD COLUMN IF NOT EXISTS square_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_profiles_square_customer
  ON yabai_travel.user_profiles(square_customer_id);

-- Add Square columns to subscriptions table
ALTER TABLE yabai_travel.subscriptions
  ADD COLUMN IF NOT EXISTS square_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS square_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'JPY';

CREATE INDEX IF NOT EXISTS idx_subscriptions_square_customer
  ON yabai_travel.subscriptions(square_customer_id);

-- Grant access
GRANT SELECT, UPDATE ON yabai_travel.user_profiles TO authenticated;
GRANT SELECT ON yabai_travel.subscriptions TO authenticated;
