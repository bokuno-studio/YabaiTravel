-- #193: 海外レースの二重翻訳問題修正 — ソース言語追跡カラム追加
-- enrich 時にページの言語を検出し、翻訳の方向を制御するために使用

ALTER TABLE yabai_travel.events ADD COLUMN IF NOT EXISTS source_language TEXT;
ALTER TABLE yabai_travel_staging.events ADD COLUMN IF NOT EXISTS source_language TEXT;
