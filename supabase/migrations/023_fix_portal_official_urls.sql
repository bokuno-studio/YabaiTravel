-- ポータルサイトURLが official_url に入っている既存データを洗替対象にする
-- official_url → entry_url に移動（entry_url が空の場合のみ）、official_url はクリア
-- collected_at をリセットして再enrich対象にする

-- sportsentry
UPDATE yabai_travel.events
SET entry_url = COALESCE(entry_url, official_url),
    official_url = NULL,
    collected_at = NULL
WHERE official_url LIKE '%sportsentry.ne.jp%';

-- runnet
UPDATE yabai_travel.events
SET entry_url = COALESCE(entry_url, official_url),
    official_url = NULL,
    collected_at = NULL
WHERE official_url LIKE '%runnet.jp%';

-- LAWSON DO
UPDATE yabai_travel.events
SET entry_url = COALESCE(entry_url, official_url),
    official_url = NULL,
    collected_at = NULL
WHERE official_url LIKE '%l-tike.com%' OR official_url LIKE '%do.l-tike.com%';

-- 不正な日付もリセット（ポータル由来で明らかに古い）
UPDATE yabai_travel.events
SET event_date = NULL,
    event_date_end = NULL
WHERE collected_at IS NULL
  AND event_date IS NOT NULL
  AND event_date < '2025-01-01';
