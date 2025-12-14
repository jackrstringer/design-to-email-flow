import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EmailBlock, AnalysisResult } from '@/types/email-blocks';
import { toast } from 'sonner';

export interface DetectedBrand {
  url: string;
  name: string;
}

export interface AnalysisResultWithBrand extends AnalysisResult {
  detectedBrand: DetectedBrand | null;
}

export const useEmailAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  const [detectedBrand, setDetectedBrand] = useState<DetectedBrand | null>(null);

  const analyzeDesign = useCallback(async (imageDataUrl: string): Promise<AnalysisResultWithBrand> => {
    setIsAnalyzing(true);
    
    try {
      // Get image dimensions using naturalWidth/naturalHeight for accurate pixel dimensions
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageDataUrl;
      });
      
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      
      console.log('Sending image dimensions to AI:', width, height);
      
      const { data, error } = await supabase.functions.invoke('analyze-email-design', {
        body: { imageDataUrl, width, height },
      });

      if (error) {
        console.error('Analysis error:', error);
        throw new Error(error.message || 'Failed to analyze design');
      }

      const result = data as AnalysisResultWithBrand;
      setBlocks(result.blocks);
      setOriginalDimensions({ width: result.analyzedWidth, height: result.analyzedHeight });
      setDetectedBrand(result.detectedBrand);
      
      if (result.detectedBrand) {
        toast.success(`Detected ${result.blocks.length} blocks from ${result.detectedBrand.name}`);
      } else {
        toast.success(`Detected ${result.blocks.length} blocks`);
      }
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
    detectedBrand,
    analyzeDesign,
    updateBlock,
  };
};
