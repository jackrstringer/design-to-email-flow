-- Create footer_editor_sessions table for conversation continuity
CREATE TABLE public.footer_editor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_image_url TEXT NOT NULL,
  current_html TEXT NOT NULL,
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  vision_data JSONB,
  footer_name TEXT,
  figma_design_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.footer_editor_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sessions
CREATE POLICY "Users can view their own footer sessions"
  ON public.footer_editor_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own footer sessions"
  ON public.footer_editor_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own footer sessions"
  ON public.footer_editor_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own footer sessions"
  ON public.footer_editor_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_footer_editor_sessions_updated_at
  BEFORE UPDATE ON public.footer_editor_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups by brand
CREATE INDEX idx_footer_editor_sessions_brand_id ON public.footer_editor_sessions(brand_id);
CREATE INDEX idx_footer_editor_sessions_user_id ON public.footer_editor_sessions(user_id);