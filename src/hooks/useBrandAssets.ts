import { useState, useEffect, useCallback } from 'react';
import { BrandAssets, DEFAULT_BRAND_ASSETS, SocialLink, BrandAnalysisResult, Brand } from '@/types/brand-assets';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBrands, extractDomain } from './useBrands';

const STORAGE_KEY = 'brand-assets';
const CURRENT_BRAND_KEY = 'current-brand-id';

export function useBrandAssets() {
  const [assets, setAssets] = useState<BrandAssets>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_BRAND_ASSETS;
  });
  const [currentBrand, setCurrentBrand] = useState<Brand | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const { findBrandByDomain, createBrand, updateBrand } = useBrands();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  }, [assets]);

  // Load current brand from localStorage on mount
  useEffect(() => {
    const loadCurrentBrand = async () => {
      const brandId = localStorage.getItem(CURRENT_BRAND_KEY);
      if (brandId && assets.websiteUrl) {
        const brand = await findBrandByDomain(assets.websiteUrl);
        if (brand) {
          setCurrentBrand(brand);
        }
      }
    };
    loadCurrentBrand();
  }, []);

  const analyzeBrand = useCallback(async (websiteUrl: string): Promise<BrandAnalysisResult | null> => {
    setIsAnalyzing(true);
    try {
      // First check if we already have this brand
      const domain = extractDomain(websiteUrl);
      const existingBrand = await findBrandByDomain(domain);
      
      if (existingBrand) {
        // Load existing brand data
        setCurrentBrand(existingBrand);
        localStorage.setItem(CURRENT_BRAND_KEY, existingBrand.id);
        
        setAssets(prev => ({
          ...prev,
          websiteUrl: existingBrand.websiteUrl || websiteUrl,
          primaryColor: existingBrand.primaryColor,
          secondaryColor: existingBrand.secondaryColor,
          accentColor: existingBrand.accentColor,
          socialLinks: existingBrand.socialLinks,
          allLinks: existingBrand.allLinks,
          darkLogo: existingBrand.darkLogoUrl ? {
            url: existingBrand.darkLogoUrl,
            publicId: existingBrand.darkLogoPublicId || 'stored',
          } : undefined,
          lightLogo: existingBrand.lightLogoUrl ? {
            url: existingBrand.lightLogoUrl,
            publicId: existingBrand.lightLogoPublicId || 'stored',
          } : undefined,
        }));

        toast.success('Loaded existing brand data!');
        return {
          colors: {
            primary: existingBrand.primaryColor,
            secondary: existingBrand.secondaryColor,
            accent: existingBrand.accentColor,
          },
          socialLinks: existingBrand.socialLinks,
          allLinks: existingBrand.allLinks,
        };
      }

      // Analyze new brand with Firecrawl
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl }
      });

      if (error) throw error;

      // Update assets with discovered data (no logos from API anymore)
      setAssets(prev => ({
        ...prev,
        websiteUrl,
        primaryColor: data.colors?.primary || prev.primaryColor,
        secondaryColor: data.colors?.secondary || prev.secondaryColor,
        accentColor: data.colors?.accent,
        socialLinks: data.socialLinks || prev.socialLinks,
        allLinks: data.allLinks || [],
      }));

      toast.success('Brand analysis complete! Please upload your logos.');
      return data as BrandAnalysisResult;
    } catch (error) {
      console.error('Brand analysis failed:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [findBrandByDomain]);

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

      // Update brand in database if we have a current brand
      if (currentBrand) {
        const updateData = type === 'dark' 
          ? { darkLogoUrl: data.url, darkLogoPublicId: data.publicId }
          : { lightLogoUrl: data.url, lightLogoPublicId: data.publicId };
        await updateBrand(currentBrand.id, updateData);
      }

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded successfully`);
    } catch (error) {
      console.error('Logo upload failed:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
    }
  }, [currentBrand, updateBrand]);

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

  // Save brand to database when setup is complete
  const saveBrand = useCallback(async (name: string) => {
    if (!assets.websiteUrl) {
      toast.error('Please enter a website URL first');
      return null;
    }

    const domain = extractDomain(assets.websiteUrl);
    
    // Check if brand already exists
    const existingBrand = await findBrandByDomain(domain);
    
    if (existingBrand) {
      // Update existing brand
      const updated = await updateBrand(existingBrand.id, {
        name,
        websiteUrl: assets.websiteUrl,
        darkLogoUrl: assets.darkLogo?.url,
        darkLogoPublicId: assets.darkLogo?.publicId,
        lightLogoUrl: assets.lightLogo?.url,
        lightLogoPublicId: assets.lightLogo?.publicId,
        primaryColor: assets.primaryColor,
        secondaryColor: assets.secondaryColor,
        accentColor: assets.accentColor,
        socialLinks: assets.socialLinks,
        allLinks: assets.allLinks,
      });
      
      if (updated) {
        setCurrentBrand(updated);
        localStorage.setItem(CURRENT_BRAND_KEY, updated.id);
        toast.success('Brand updated!');
        return updated;
      }
    } else {
      // Create new brand
      const newBrand = await createBrand({
        name,
        domain,
        websiteUrl: assets.websiteUrl,
        darkLogoUrl: assets.darkLogo?.url,
        darkLogoPublicId: assets.darkLogo?.publicId,
        lightLogoUrl: assets.lightLogo?.url,
        lightLogoPublicId: assets.lightLogo?.publicId,
        primaryColor: assets.primaryColor,
        secondaryColor: assets.secondaryColor,
        accentColor: assets.accentColor,
        socialLinks: assets.socialLinks,
        allLinks: assets.allLinks,
        footerConfigured: false,
      });
      
      if (newBrand) {
        setCurrentBrand(newBrand);
        localStorage.setItem(CURRENT_BRAND_KEY, newBrand.id);
        toast.success('Brand saved!');
        return newBrand;
      }
    }
    
    return null;
  }, [assets, findBrandByDomain, createBrand, updateBrand]);

  // Require BOTH logos for complete setup
  const hasCompletedSetup = Boolean(assets.darkLogo && assets.lightLogo);

  return {
    assets,
    currentBrand,
    isUploading,
    isAnalyzing,
    analyzeBrand,
    uploadLogo,
    removeLogo,
    updateSocialLinks,
    updateColors,
    updateWebsiteUrl,
    saveBrand,
    hasCompletedSetup,
  };
}
