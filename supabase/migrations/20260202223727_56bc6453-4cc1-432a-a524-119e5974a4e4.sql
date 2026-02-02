-- ============================================================================
-- EmailForge Processing Pipeline Schema
-- ============================================================================

-- Extend campaigns table for processing pipeline
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT,
ADD COLUMN IF NOT EXISTS vision_data JSONB,
ADD COLUMN IF NOT EXISTS module_boundaries JSONB,
ADD COLUMN IF NOT EXISTS campaign_analysis JSONB,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS processing_step TEXT,
ADD COLUMN IF NOT EXISTS processing_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS raw_image_url TEXT;

-- Extend brands table for stats tracking
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS total_modules INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_campaigns INTEGER DEFAULT 0;

-- Create modules table for storing analyzed email modules
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- Position and type
  module_index INTEGER NOT NULL,
  module_type TEXT NOT NULL,
  module_type_confidence FLOAT DEFAULT 0.8,
  
  -- Image data (Cloudinary URLs)
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  y_start INTEGER NOT NULL,
  y_end INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  
  -- AI-extracted content
  content JSONB DEFAULT '{}',
  visuals JSONB DEFAULT '{}',
  layout JSONB DEFAULT '{}',
  composition_notes TEXT,
  
  -- Quality and training
  quality_score FLOAT DEFAULT 0,
  is_reference_quality BOOLEAN DEFAULT false,
  embedding vector(1536),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create brand_profiles table for aggregated design patterns
CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID UNIQUE NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- AI-generated brand design patterns
  design_patterns JSONB DEFAULT '{}',
  color_palette JSONB DEFAULT '{}',
  typography_patterns JSONB DEFAULT '{}',
  layout_preferences JSONB DEFAULT '{}',
  
  last_analyzed_at TIMESTAMPTZ,
  module_count_at_analysis INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create processing_jobs table for background tasks
CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for modules table
CREATE INDEX IF NOT EXISTS modules_brand_id_idx ON modules(brand_id);
CREATE INDEX IF NOT EXISTS modules_campaign_id_idx ON modules(campaign_id);
CREATE INDEX IF NOT EXISTS modules_module_type_idx ON modules(module_type);
CREATE INDEX IF NOT EXISTS modules_is_reference_quality_idx ON modules(is_reference_quality) WHERE is_reference_quality = true;

-- Create indexes for processing_jobs
CREATE INDEX IF NOT EXISTS processing_jobs_status_idx ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS processing_jobs_brand_id_idx ON processing_jobs(brand_id);

-- Enable RLS on new tables
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for modules (tied to brand ownership)
CREATE POLICY "Users can view modules for own brands" ON modules
FOR SELECT USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can create modules for own brands" ON modules
FOR INSERT WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update modules for own brands" ON modules
FOR UPDATE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete modules for own brands" ON modules
FOR DELETE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- RLS policies for brand_profiles
CREATE POLICY "Users can view profiles for own brands" ON brand_profiles
FOR SELECT USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can create profiles for own brands" ON brand_profiles
FOR INSERT WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update profiles for own brands" ON brand_profiles
FOR UPDATE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete profiles for own brands" ON brand_profiles
FOR DELETE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- RLS policies for processing_jobs
CREATE POLICY "Users can view jobs for own brands" ON processing_jobs
FOR SELECT USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can create jobs for own brands" ON processing_jobs
FOR INSERT WITH CHECK (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can update jobs for own brands" ON processing_jobs
FOR UPDATE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete jobs for own brands" ON processing_jobs
FOR DELETE USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- Trigger to update updated_at on modules
CREATE TRIGGER update_modules_updated_at
BEFORE UPDATE ON modules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on brand_profiles
CREATE TRIGGER update_brand_profiles_updated_at
BEFORE UPDATE ON brand_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();