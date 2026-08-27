-- Add cover image to restaurants table for hero section
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
