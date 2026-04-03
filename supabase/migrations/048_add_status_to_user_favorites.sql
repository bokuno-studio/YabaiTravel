-- Add status column to user_favorites to distinguish between 'favorite' and 'going'
ALTER TABLE yabai_travel.user_favorites
ADD COLUMN status TEXT NOT NULL DEFAULT 'favorite'
CHECK (status IN ('favorite', 'going', 'attended'));

CREATE INDEX idx_user_favorites_status
ON yabai_travel.user_favorites(user_id, status);
