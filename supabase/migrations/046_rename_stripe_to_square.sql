-- Rename Stripe columns to Square in user_profiles
ALTER TABLE yabai_travel.user_profiles
  RENAME COLUMN stripe_customer_id TO square_customer_id;
ALTER TABLE yabai_travel.user_profiles
  RENAME COLUMN stripe_subscription_id TO square_subscription_id;

-- Rename in subscriptions table if columns exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE yabai_travel.subscriptions RENAME COLUMN stripe_customer_id TO square_customer_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'yabai_travel' AND table_name = 'subscriptions' AND column_name = 'stripe_subscription_id') THEN
    ALTER TABLE yabai_travel.subscriptions RENAME COLUMN stripe_subscription_id TO square_subscription_id;
  END IF;
END $$;
