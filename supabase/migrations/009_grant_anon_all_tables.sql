-- anon ロールに categories, access_routes, accommodations の SELECT を許可

set search_path to yabai_travel, public;

GRANT SELECT ON yabai_travel.categories TO anon;
GRANT SELECT ON yabai_travel.access_routes TO anon;
GRANT SELECT ON yabai_travel.accommodations TO anon;
