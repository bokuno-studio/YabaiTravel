-- Events
CREATE INDEX IF NOT EXISTS idx_events_event_date ON yabai_travel.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_race_type ON yabai_travel.events(race_type);
CREATE INDEX IF NOT EXISTS idx_events_country ON yabai_travel.events(country);
CREATE INDEX IF NOT EXISTS idx_events_collected_at ON yabai_travel.events(collected_at);

-- Categories
CREATE INDEX IF NOT EXISTS idx_categories_event_id ON yabai_travel.categories(event_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON yabai_travel.categories(name);

-- Access routes
CREATE INDEX IF NOT EXISTS idx_access_routes_event_id ON yabai_travel.access_routes(event_id);

-- Accommodations
CREATE INDEX IF NOT EXISTS idx_accommodations_event_id ON yabai_travel.accommodations(event_id);
