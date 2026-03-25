-- ============================================================
-- 045_enable_rls_all_tables.sql
-- RLS セキュリティ強化: 未設定テーブルに RLS を有効化
-- ============================================================

-- ============================================================
-- Phase 1: CRITICAL / HIGH
-- ============================================================

-- subscriptions: 課金情報 — ユーザーは自分のレコードのみ参照可能
ALTER TABLE yabai_travel.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own subscriptions' AND tablename = 'subscriptions') THEN
    CREATE POLICY "Users can view own subscriptions"
      ON yabai_travel.subscriptions FOR SELECT
      USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to subscriptions' AND tablename = 'subscriptions') THEN
    CREATE POLICY "Service role full access to subscriptions"
      ON yabai_travel.subscriptions FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- crawl_snapshots: 内部用 — service_role のみ
ALTER TABLE yabai_travel.crawl_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only crawl_snapshots' AND tablename = 'crawl_snapshots') THEN
    CREATE POLICY "Service role only crawl_snapshots"
      ON yabai_travel.crawl_snapshots FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- crawl_daily_stats: 内部用 — service_role のみ
ALTER TABLE yabai_travel.crawl_daily_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only crawl_daily_stats' AND tablename = 'crawl_daily_stats') THEN
    CREATE POLICY "Service role only crawl_daily_stats"
      ON yabai_travel.crawl_daily_stats FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- inquiries: INSERT は誰でも可、SELECT は service_role のみ
ALTER TABLE yabai_travel.inquiries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can submit inquiry' AND tablename = 'inquiries') THEN
    CREATE POLICY "Anyone can submit inquiry"
      ON yabai_travel.inquiries FOR INSERT
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can read inquiries' AND tablename = 'inquiries') THEN
    CREATE POLICY "Service role can read inquiries"
      ON yabai_travel.inquiries FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- ============================================================
-- Phase 2: 公開データテーブル（SELECT anyone）
-- ============================================================

-- events
ALTER TABLE yabai_travel.events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read events' AND tablename = 'events') THEN
    CREATE POLICY "Anyone can read events"
      ON yabai_travel.events FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to events' AND tablename = 'events') THEN
    CREATE POLICY "Service role full access to events"
      ON yabai_travel.events FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- categories
ALTER TABLE yabai_travel.categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read categories' AND tablename = 'categories') THEN
    CREATE POLICY "Anyone can read categories"
      ON yabai_travel.categories FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to categories' AND tablename = 'categories') THEN
    CREATE POLICY "Service role full access to categories"
      ON yabai_travel.categories FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- access_routes
ALTER TABLE yabai_travel.access_routes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read access_routes' AND tablename = 'access_routes') THEN
    CREATE POLICY "Anyone can read access_routes"
      ON yabai_travel.access_routes FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to access_routes' AND tablename = 'access_routes') THEN
    CREATE POLICY "Service role full access to access_routes"
      ON yabai_travel.access_routes FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- accommodations
ALTER TABLE yabai_travel.accommodations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read accommodations' AND tablename = 'accommodations') THEN
    CREATE POLICY "Anyone can read accommodations"
      ON yabai_travel.accommodations FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to accommodations' AND tablename = 'accommodations') THEN
    CREATE POLICY "Service role full access to accommodations"
      ON yabai_travel.accommodations FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- event_series
ALTER TABLE yabai_travel.event_series ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read event_series' AND tablename = 'event_series') THEN
    CREATE POLICY "Anyone can read event_series"
      ON yabai_travel.event_series FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to event_series' AND tablename = 'event_series') THEN
    CREATE POLICY "Service role full access to event_series"
      ON yabai_travel.event_series FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- course_map_files
ALTER TABLE yabai_travel.course_map_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read course_map_files' AND tablename = 'course_map_files') THEN
    CREATE POLICY "Anyone can read course_map_files"
      ON yabai_travel.course_map_files FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to course_map_files' AND tablename = 'course_map_files') THEN
    CREATE POLICY "Service role full access to course_map_files"
      ON yabai_travel.course_map_files FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- change_requests: authenticated のみ
ALTER TABLE yabai_travel.change_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read change_requests' AND tablename = 'change_requests') THEN
    CREATE POLICY "Authenticated users can read change_requests"
      ON yabai_travel.change_requests FOR SELECT
      TO authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert change_requests' AND tablename = 'change_requests') THEN
    CREATE POLICY "Authenticated users can insert change_requests"
      ON yabai_travel.change_requests FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to change_requests' AND tablename = 'change_requests') THEN
    CREATE POLICY "Service role full access to change_requests"
      ON yabai_travel.change_requests FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Phase 3: staging スキーマ（service_role only）
-- ============================================================

ALTER TABLE yabai_travel_staging.events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only staging events' AND tablename = 'events') THEN
    CREATE POLICY "Service role only staging events"
      ON yabai_travel_staging.events FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE yabai_travel_staging.categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only staging categories' AND tablename = 'categories') THEN
    CREATE POLICY "Service role only staging categories"
      ON yabai_travel_staging.categories FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE yabai_travel_staging.access_routes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only staging access_routes' AND tablename = 'access_routes') THEN
    CREATE POLICY "Service role only staging access_routes"
      ON yabai_travel_staging.access_routes FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE yabai_travel_staging.accommodations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only staging accommodations' AND tablename = 'accommodations') THEN
    CREATE POLICY "Service role only staging accommodations"
      ON yabai_travel_staging.accommodations FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE yabai_travel_staging.crawl_daily_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only staging crawl_daily_stats' AND tablename = 'crawl_daily_stats') THEN
    CREATE POLICY "Service role only staging crawl_daily_stats"
      ON yabai_travel_staging.crawl_daily_stats FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
