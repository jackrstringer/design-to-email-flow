import { useState, useEffect, useCallback } from 'react';
import { BrandAssets, DEFAULT_BRAND_ASSETS, SocialLink } from '@/types/brand-assets';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'brand-assets';

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAssets>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_BRAND_ASSETS;
  });
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  const uploadLogo = useCallback(async (file: File) => {
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

      setAssets(prev => ({
        ...prev,
        logo: {
          url: data.url,
          publicId: data.publicId
        }
      }));

      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Logo upload failed:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const removeLogo = useCallback(() => {
    setAssets(prev => ({ ...prev, logo: undefined }));
  }, []);

  const updateSocialLinks = useCallback((links: SocialLink[]) => {
    setAssets(prev => ({ ...prev, socialLinks: links }));
  }, []);

  const updateColors = useCallback((primaryColor: string, secondaryColor: string) => {
    setAssets(prev => ({ ...prev, primaryColor, secondaryColor }));
  }, []);

  const hasCompletedSetup = Boolean(assets.logo);

  return {
    assets,
    isUploading,
    uploadLogo,
    removeLogo,
    updateSocialLinks,
    updateColors,
    hasCompletedSetup,
  };
}
