-- Add footer_type column to distinguish HTML vs Image-based footers
ALTER TABLE brand_footers 
ADD COLUMN footer_type text DEFAULT 'html' CHECK (footer_type IN ('html', 'image'));

-- Store image slice data for image-type footers
ALTER TABLE brand_footers
ADD COLUMN image_slices jsonb;

-- Add comment for documentation
COMMENT ON COLUMN brand_footers.footer_type IS 'Type of footer: html (generated via refinement) or image (sliced images + legal HTML)';
COMMENT ON COLUMN brand_footers.image_slices IS 'JSON array of image slice data for image-type footers including URLs, alt text, and links';