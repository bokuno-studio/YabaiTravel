-- User profiles (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS yabai_travel.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  membership TEXT NOT NULL DEFAULT 'free',  -- free, supporter
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION yabai_travel.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO yabai_travel.user_profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: create profile when new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION yabai_travel.handle_new_user();

-- RLS
ALTER TABLE yabai_travel.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON yabai_travel.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON yabai_travel.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer ON yabai_travel.user_profiles(stripe_customer_id);

-- Grant access via anon/authenticated roles
GRANT SELECT, UPDATE ON yabai_travel.user_profiles TO authenticated;
GRANT SELECT ON yabai_travel.user_profiles TO anon;
