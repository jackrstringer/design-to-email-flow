import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EmailBlock, AnalysisResult } from '@/types/email-blocks';
import { toast } from 'sonner';

export const useEmailAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });

  const analyzeDesign = useCallback(async (imageDataUrl: string) => {
    setIsAnalyzing(true);
    
    try {
      // Get image dimensions
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageDataUrl;
      });
      
      const { data, error } = await supabase.functions.invoke('analyze-email-design', {
        body: { imageDataUrl, width: img.width, height: img.height },
      });

      if (error) {
        console.error('Analysis error:', error);
        throw new Error(error.message || 'Failed to analyze design');
      }

      const result = data as AnalysisResult;
      setBlocks(result.blocks);
      setOriginalDimensions({ width: result.originalWidth, height: result.originalHeight });
      
      toast.success(`Detected ${result.blocks.length} blocks`);
      return result;
    } catch (err) {
      console.error('Error analyzing design:', err);
      toast.error('Failed to analyze design. Please try again.');
      throw err;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const updateBlock = useCallback((blockId: string, updates: Partial<EmailBlock>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    );
  }, []);

  return {
    isAnalyzing,
    blocks,
    originalDimensions,
    analyzeDesign,
    updateBlock,
  };
};
