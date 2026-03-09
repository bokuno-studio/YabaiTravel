-- anon ロールに yabai_travel.events の SELECT を許可（フロントから参照するため）
set search_path to yabai_travel, public;

GRANT USAGE ON SCHEMA yabai_travel TO anon;
GRANT SELECT ON yabai_travel.events TO anon;
