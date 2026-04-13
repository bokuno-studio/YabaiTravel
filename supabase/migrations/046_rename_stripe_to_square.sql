-- Rename Stripe columns to Square in user_profiles (idempotent)
-- Only rename if source column exists AND target column does not yet exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'user_profiles' AND column_name = 'stripe_customer_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'user_profiles' AND column_name = 'square_customer_id')
  THEN
    ALTER TABLE yabai_travel.user_profiles RENAME COLUMN stripe_customer_id TO square_customer_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'user_profiles' AND column_name = 'stripe_subscription_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'user_profiles' AND column_name = 'square_subscription_id')
  THEN
    ALTER TABLE yabai_travel.user_profiles RENAME COLUMN stripe_subscription_id TO square_subscription_id;
  END IF;
END $$;

-- Rename in subscriptions table if columns exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'stripe_customer_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'square_customer_id')
  THEN
    ALTER TABLE yabai_travel.subscriptions RENAME COLUMN stripe_customer_id TO square_customer_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'stripe_subscription_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'square_subscription_id')
  THEN
    ALTER TABLE yabai_travel.subscriptions RENAME COLUMN stripe_subscription_id TO square_subscription_id;
  END IF;
END $$;
