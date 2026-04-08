-- 論理削除: events テーブルに deleted_at カラムを追加
-- 物理 DELETE の代わりに UPDATE SET deleted_at = NOW() を使用する

-- 1. deleted_at カラム追加
ALTER TABLE yabai_travel.events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. インデックス追加（deleted_at IS NULL の部分インデックス）
CREATE INDEX IF NOT EXISTS idx_events_not_deleted
  ON yabai_travel.events (id)
  WHERE deleted_at IS NULL;

-- 3. RLS ポリシー更新: anon ユーザーには論理削除されたレコードを非表示
DROP POLICY IF EXISTS "Anyone can read events" ON yabai_travel.events;
CREATE POLICY "Anyone can read events"
  ON yabai_travel.events FOR SELECT
  USING (deleted_at IS NULL);

-- service_role のポリシーはそのまま（全行アクセス可能 = 削除済みも参照可能）
