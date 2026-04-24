-- 論理削除: categories テーブルに deleted_at カラムを追加

-- 1. deleted_at カラム追加
ALTER TABLE yabai_travel.categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. インデックス追加（deleted_at IS NULL の部分インデックス）
CREATE INDEX IF NOT EXISTS idx_categories_not_deleted
  ON yabai_travel.categories (id)
  WHERE deleted_at IS NULL;

-- 3. RLS ポリシー更新: anon ユーザーには論理削除されたレコードを非表示
DROP POLICY IF EXISTS "Anyone can read categories" ON yabai_travel.categories;
CREATE POLICY "Anyone can read categories"
  ON yabai_travel.categories FOR SELECT
  USING (deleted_at IS NULL);
