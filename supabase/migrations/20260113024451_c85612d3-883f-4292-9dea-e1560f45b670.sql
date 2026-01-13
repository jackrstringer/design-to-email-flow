-- Phase 0: Authentication + Phase 1: Queue Schema

-- 1. Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  figma_access_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own profile
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Plugin tokens table (user-level)
CREATE TABLE public.plugin_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT DEFAULT 'Figma Plugin',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE public.plugin_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" 
  ON public.plugin_tokens FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tokens" 
  ON public.plugin_tokens FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" 
  ON public.plugin_tokens FOR DELETE 
  USING (auth.uid() = user_id);

-- 3. Campaign queue table
CREATE TABLE public.campaign_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id),
  
  -- Source info
  source TEXT NOT NULL CHECK (source IN ('figma', 'upload', 'clickup')),
  source_url TEXT,
  source_metadata JSONB,
  
  -- Campaign content
  name TEXT,
  image_url TEXT,
  image_width INT,
  image_height INT,
  
  -- Processing results
  slices JSONB,
  footer_start_percent FLOAT,
  
  -- Subject line / Preview text
  provided_subject_line TEXT,
  provided_preview_text TEXT,
  generated_subject_lines JSONB,
  generated_preview_texts JSONB,
  selected_subject_line TEXT,
  selected_preview_text TEXT,
  
  -- QA
  qa_flags JSONB,
  spelling_errors JSONB,
  
  -- Status
  status TEXT DEFAULT 'processing' 
    CHECK (status IN ('processing', 'ready_for_review', 'approved', 'sent_to_klaviyo', 'failed')),
  processing_step TEXT,
  processing_percent INT DEFAULT 0,
  error_message TEXT,
  
  -- Retry support
  retry_from_step TEXT,
  retry_count INT DEFAULT 0,
  
  -- Klaviyo
  klaviyo_template_id TEXT,
  klaviyo_campaign_id TEXT,
  klaviyo_campaign_url TEXT,
  sent_to_klaviyo_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users can only see their own campaigns
ALTER TABLE public.campaign_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue items" 
  ON public.campaign_queue FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue items" 
  ON public.campaign_queue FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue items" 
  ON public.campaign_queue FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue items" 
  ON public.campaign_queue FOR DELETE 
  USING (auth.uid() = user_id);

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_queue;

-- Updated_at trigger for campaign_queue
CREATE TRIGGER update_campaign_queue_updated_at
  BEFORE UPDATE ON campaign_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();