-- Create footer_processing_jobs table for tracking image footer processing
CREATE TABLE public.footer_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  
  -- Source info
  source TEXT NOT NULL CHECK (source IN ('upload', 'figma')),
  source_url TEXT,  -- Figma URL if applicable
  
  -- Input image
  image_url TEXT NOT NULL,
  cloudinary_public_id TEXT,
  image_width INT,
  image_height INT,
  
  -- Processing results
  slices JSONB,  -- Array of processed slices with links/alt text
  legal_section JSONB,  -- { yStart, backgroundColor, textColor, detectedElements }
  legal_cutoff_y INT,  -- Where footer slices end (legal section starts)
  
  -- Status tracking
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'pending_review', 'completed', 'failed')),
  processing_step TEXT,
  processing_percent INT DEFAULT 0,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processing_completed_at TIMESTAMPTZ
);

-- RLS policies
ALTER TABLE public.footer_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own footer jobs" 
  ON public.footer_processing_jobs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own footer jobs" 
  ON public.footer_processing_jobs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own footer jobs" 
  ON public.footer_processing_jobs FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own footer jobs" 
  ON public.footer_processing_jobs FOR DELETE 
  USING (auth.uid() = user_id);

-- Enable realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.footer_processing_jobs;

-- Updated_at trigger
CREATE TRIGGER update_footer_processing_jobs_updated_at
  BEFORE UPDATE ON footer_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();