import { useState, useEffect, useCallback } from 'react';
import { BrandAssets, DEFAULT_BRAND_ASSETS, SocialLink, BrandAnalysisResult } from '@/types/brand-assets';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'brand-assets';

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAssets>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_BRAND_ASSETS;
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  const analyzeBrand = useCallback(async (websiteUrl: string): Promise<BrandAnalysisResult | null> => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl }
      });

      if (error) throw error;

      // Update assets with discovered data
      setAssets(prev => ({
        ...prev,
        websiteUrl,
        primaryColor: data.colors?.primary || prev.primaryColor,
        secondaryColor: data.colors?.secondary || prev.secondaryColor,
        accentColor: data.colors?.accent,
        socialLinks: data.socialLinks || prev.socialLinks,
      }));

      toast.success('Brand analysis complete!');
      return data as BrandAnalysisResult;
    } catch (error) {
      console.error('Brand analysis failed:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const uploadLogo = useCallback(async (file: File, type: 'dark' | 'light') => {
    setIsUploading(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const base64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { 
          imageData: base64,
          folder: 'brand-assets'
        }
      });

      if (error) throw error;

      const logoKey = type === 'dark' ? 'darkLogo' : 'lightLogo';
      setAssets(prev => ({
        ...prev,
        [logoKey]: {
          url: data.url,
          publicId: data.publicId
        }
      }));

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded successfully`);
    } catch (error) {
      console.error('Logo upload failed:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const removeLogo = useCallback((type: 'dark' | 'light') => {
    const logoKey = type === 'dark' ? 'darkLogo' : 'lightLogo';
    setAssets(prev => ({ ...prev, [logoKey]: undefined }));
  }, []);

  const updateSocialLinks = useCallback((links: SocialLink[]) => {
    setAssets(prev => ({ ...prev, socialLinks: links }));
  }, []);

  const updateColors = useCallback((primaryColor: string, secondaryColor: string, accentColor?: string) => {
    setAssets(prev => ({ ...prev, primaryColor, secondaryColor, accentColor }));
  }, []);

  const updateWebsiteUrl = useCallback((websiteUrl: string) => {
    setAssets(prev => ({ ...prev, websiteUrl }));
  }, []);

  // Require both logos for complete setup
  const hasCompletedSetup = Boolean(assets.darkLogo && assets.lightLogo);

  return {
    assets,
    isUploading,
    isAnalyzing,
    analyzeBrand,
    uploadLogo,
    removeLogo,
    updateSocialLinks,
    updateColors,
    updateWebsiteUrl,
    hasCompletedSetup,
  };
}
