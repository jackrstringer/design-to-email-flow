-- Add columns to store actual Cloudinary dimensions and public ID
ALTER TABLE campaign_queue 
ADD COLUMN IF NOT EXISTS actual_image_width INTEGER,
ADD COLUMN IF NOT EXISTS actual_image_height INTEGER,
ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;