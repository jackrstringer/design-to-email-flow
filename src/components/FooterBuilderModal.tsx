import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Loader2, ChevronRight, ChevronLeft, X, Sparkles, Figma, Image, Layers, Check, Link, ExternalLink, AlertCircle, CheckCircle2, Clock, Wand2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SocialLinksEditor } from './SocialLinksEditor';
import { uploadAllSocialIcons } from '@/lib/socialIcons';
import { FooterCropSelector } from './FooterCropSelector';
import { AssetCollectionModal } from './AssetCollectionModal';
import type { Brand, SocialLink } from '@/types/brand-assets';
import { Badge } from '@/components/ui/badge';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: any;
}

interface FooterBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  onFooterSaved: () => void;
  onOpenStudio?: (referenceImageUrl: string, footerHtml: string, figmaDesignData?: any, conversationHistory?: ConversationMessage[]) => void;
  initialCampaignImageUrl?: string;
  onGenerationStateChange?: (isGenerating: boolean) => void;
  renderDuringGeneration?: React.ReactNode;
}

type Step = 'reference' | 'links' | 'social' | 'generate';
type SourceType = 'image' | 'figma' | 'campaign' | null;

interface DetectedLink {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  searchedUrl: string;
  verified: boolean;
  needsManualUrl: boolean;
  placeholder?: string;
}

interface ClickableElement {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  likely_destination: string;
}

interface Campaign {
  id: string;
  name: string;
  original_image_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  brand_id?: string;
  brandName?: string;
}

interface FigmaDesignData {
  design: any;
  designData: {
    colors: string[];
    fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }>;
    texts: Array<{ content: string; isUrl: boolean; fontSize?: number; fontWeight?: number; color?: string }>;
    spacing: { paddings: number[]; gaps: number[] };
    borders: Array<{ color: string; width: number }>;
    elements: Array<{ 
      name: string; 
      width: number; 
      height: number; 
      type: string;
      backgroundColor?: string;
      borderColor?: string;
      borderWidth?: number;
      borderRadius?: number;
      padding?: { top: number; right: number; bottom: number; left: number };
      gap?: number;
    }>;
    rootDimensions: { width: number; height: number };
  } | null;
  imageUrls: Record<string, string>;
  exportedImageUrl: string | null;
}

interface ExtractedAsset {
  id: string;
  description: string;
  location: string;
  category: string;
  crop_hint?: {
    x_percent: number;
    y_percent: number;
    width_percent: number;
    height_percent: number;
  };
}

interface TextBasedElement {
  id: string;
  description: string;
  recommendation: string;
}

interface StyleTokens {
  background_color?: string;
  text_color?: string;
  accent_color?: string;
}

interface LogoAnalysis {
  logo_visible: boolean;
  background_is_dark: boolean;
  needed_variant: 'light' | 'dark';
  logo_position?: string;
  estimated_size?: { width_percent: number; height_percent: number };
}

interface LogoConversionNeeded {
  sourceUrl: string;
  targetVariant: 'light' | 'dark';
  canAutoConvert: boolean;
}

export function FooterBuilderModal({ open, onOpenChange, brand, onFooterSaved, onOpenStudio, initialCampaignImageUrl, onGenerationStateChange, renderDuringGeneration }: FooterBuilderModalProps) {
  const [step, setStep] = useState<Step>('reference');
  const [sourceType, setSourceType] = useState<SourceType>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  
  // Figma state
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [figmaData, setFigmaData] = useState<FigmaDesignData | null>(null);
  const [hasFigmaToken, setHasFigmaToken] = useState<boolean | null>(null); // null = checking
  
  // Campaign state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false);
  const [showingAllBrands, setShowingAllBrands] = useState(false);
  const [selectedCampaignImage, setSelectedCampaignImage] = useState<string | null>(null);
  const [isUploadingCrop, setIsUploadingCrop] = useState(false);
  
  // Asset extraction state - NEW SIMPLIFIED
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const [assetsNeeded, setAssetsNeeded] = useState<ExtractedAsset[]>([]);
  const [textBasedElements, setTextBasedElements] = useState<TextBasedElement[]>([]);
  const [clickableElements, setClickableElements] = useState<ClickableElement[]>([]);
  const [socialPlatforms, setSocialPlatforms] = useState<string[]>([]);
  const [extractedStyles, setExtractedStyles] = useState<StyleTokens | null>(null);
  const [socialIconColor, setSocialIconColor] = useState<string>('#ffffff');
  
  // Logo analysis state - NEW
  const [logoAnalysis, setLogoAnalysis] = useState<LogoAnalysis | null>(null);
  const [logoConversionNeeded, setLogoConversionNeeded] = useState<LogoConversionNeeded | null>(null);
  const [isInvertingLogo, setIsInvertingLogo] = useState(false);
  
  // Asset collection modal state
  const [showAssetCollectionModal, setShowAssetCollectionModal] = useState(false);
  const [collectedAssets, setCollectedAssets] = useState<Record<string, string>>({});
  
  // Links state - NEW
  const [detectedLinks, setDetectedLinks] = useState<DetectedLink[]>([]);
  const [isDetectingLinks, setIsDetectingLinks] = useState(false);
  const [approvedLinks, setApprovedLinks] = useState<DetectedLink[]>([]);
  
  // Social detection state
  const [isDetectingSocials, setIsDetectingSocials] = useState(false);
  
  // Processing tracking
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [dynamicMessage, setDynamicMessage] = useState('');
  
  // Social state
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(brand.socialLinks || []);
  const [iconColor, setIconColor] = useState('ffffff');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  
  // Notify parent when generation state changes
  useEffect(() => {
    onGenerationStateChange?.(isGenerating);
  }, [isGenerating, onGenerationStateChange]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute if processing is in progress
  const isProcessingReference = isUploadingReference || isUploadingCrop || isFetchingFigma || isExtractingAssets || isDetectingLinks || isDetectingSocials;
  
  // Dynamic messages for the loading screen
  const dynamicMessages = [
    "Analyzing footer layout...",
    "Detecting navigation links...",
    "Finding social media icons...",
    "Matching URLs to link text...",
    "Verifying links are reachable...",
    "Extracting color palette...",
    "Reading text content...",
    "Almost there...",
  ];
  
  // Timer for elapsed time and dynamic messages
  useEffect(() => {
    if (!isProcessingReference) {
      setProcessingStartTime(null);
      setProcessingElapsed(0);
      return;
    }
    
    if (!processingStartTime) {
      setProcessingStartTime(Date.now());
    }
    
    const interval = setInterval(() => {
      if (processingStartTime) {
        setProcessingElapsed(Math.floor((Date.now() - processingStartTime) / 1000));
      }
      // Rotate dynamic message every 3 seconds
      setDynamicMessage(dynamicMessages[Math.floor(Math.random() * dynamicMessages.length)]);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isProcessingReference, processingStartTime]);

  // Check for Figma plugin token on mount
  useEffect(() => {
    const checkFigmaToken = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setHasFigmaToken(false);
          return;
        }
        
        const { data, error } = await supabase
          .from('plugin_tokens')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        
        setHasFigmaToken(!error && data && data.length > 0);
      } catch (err) {
        console.error('Error checking Figma token:', err);
        setHasFigmaToken(false);
      }
    };
    
    if (open) {
      checkFigmaToken();
    }
  }, [open]);

  // Reset to reference step - clears all state for a fresh start
  const resetToReference = useCallback(() => {
    setReferenceImageUrl(null);
    setSourceType(null);
    setFigmaUrl('');
    setFigmaData(null);
    setCampaigns([]);
    setSelectedCampaignImage(null);
    setAssetsNeeded([]);
    setTextBasedElements([]);
    setClickableElements([]);
    setSocialPlatforms([]);
    setExtractedStyles(null);
    setLogoAnalysis(null);
    setLogoConversionNeeded(null);
    setCollectedAssets({});
    setDetectedLinks([]);
    setApprovedLinks([]);
    setSocialLinks(brand.socialLinks || []);
    setStep('reference');
  }, [brand.socialLinks]);

  // No brand library - user uploads all assets explicitly

  // Handle campaign source click
  const handleCampaignSourceClick = useCallback(() => {
    if (initialCampaignImageUrl) {
      setSelectedCampaignImage(initialCampaignImageUrl);
      setSourceType('campaign');
    } else {
      fetchCampaigns();
    }
  }, [initialCampaignImageUrl]);

  // Fetch campaigns from database
  const fetchCampaigns = useCallback(async () => {
    setIsFetchingCampaigns(true);
    setShowingAllBrands(false);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, original_image_url, thumbnail_url, created_at, brand_id')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      let campaignsWithImages = (data || []).filter(c => c.original_image_url || c.thumbnail_url);
      
      if (campaignsWithImages.length === 0) {
        const { data: allData, error: allError } = await supabase
          .from('campaigns')
          .select('id, name, original_image_url, thumbnail_url, created_at, brand_id, brands(name)')
          .order('created_at', { ascending: false })
          .limit(10);

        if (allError) throw allError;
        
        campaignsWithImages = (allData || [])
          .filter(c => c.original_image_url || c.thumbnail_url)
          .map(c => ({
            ...c,
            brandName: (c.brands as { name: string } | null)?.name || 'Unknown'
          }));
        
        if (campaignsWithImages.length > 0) {
          setShowingAllBrands(true);
        }
      }
      
      if (campaignsWithImages.length === 0) {
        toast.error('No campaigns with images found');
        return;
      }
      
      setCampaigns(campaignsWithImages);
      setSourceType('campaign');
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Failed to fetch campaigns');
    } finally {
      setIsFetchingCampaigns(false);
    }
  }, [brand.id]);

  // Extract assets from reference image - SIMPLIFIED: one pass, then show modal if needed
  const extractAssetsFromImage = useCallback(async (imageUrl: string) => {
    setIsExtractingAssets(true);
    setLogoAnalysis(null);
    setLogoConversionNeeded(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('extract-section-assets', {
        body: { referenceImageUrl: imageUrl }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to extract assets');
      }

      console.log('Extracted assets:', data);

      // Store logo analysis result
      const logoAnalysisResult = data.logo_analysis as LogoAnalysis | null;
      setLogoAnalysis(logoAnalysisResult);
      console.log('Logo analysis:', logoAnalysisResult);

      // Pre-populate collected assets with brand's stored logos
      const initialAssets: Record<string, string> = {};
      if (brand.lightLogoUrl) {
        initialAssets['brand_logo_light'] = brand.lightLogoUrl;
        console.log('Pre-populated light logo from brand:', brand.lightLogoUrl);
      }
      if (brand.darkLogoUrl) {
        initialAssets['brand_logo_dark'] = brand.darkLogoUrl;
        console.log('Pre-populated dark logo from brand:', brand.darkLogoUrl);
      }

      // Smart logo handling based on logo analysis
      let assetsToUpload = data.requires_upload || [];
      
      if (logoAnalysisResult?.logo_visible) {
        const neededVariant = logoAnalysisResult.needed_variant; // 'light' or 'dark'
        const hasCorrectLogo = neededVariant === 'light' 
          ? !!brand.lightLogoUrl 
          : !!brand.darkLogoUrl;
        const hasAlternativeLogo = neededVariant === 'light'
          ? !!brand.darkLogoUrl
          : !!brand.lightLogoUrl;

        console.log(`Logo analysis: needs ${neededVariant} variant, hasCorrect: ${hasCorrectLogo}, hasAlternative: ${hasAlternativeLogo}`);

        if (hasCorrectLogo) {
          // We have the correct logo variant - use it
          const correctLogoUrl = neededVariant === 'light' ? brand.lightLogoUrl : brand.darkLogoUrl;
          initialAssets['logo'] = correctLogoUrl!;
          initialAssets['brand_logo'] = correctLogoUrl!;
          
          // Filter out logo from requires_upload since we have it
          assetsToUpload = assetsToUpload.filter((asset: ExtractedAsset) => 
            asset.category !== 'logo' && !asset.id.toLowerCase().includes('logo')
          );
          console.log('Using correct logo variant:', correctLogoUrl);
        } else if (hasAlternativeLogo) {
          // We have the wrong variant - offer to auto-invert
          const sourceUrl = neededVariant === 'light' ? brand.darkLogoUrl : brand.lightLogoUrl;
          setLogoConversionNeeded({
            sourceUrl: sourceUrl!,
            targetVariant: neededVariant,
            canAutoConvert: true
          });
          console.log('Logo variant mismatch - offering auto-invert');
          
          // Filter out logo from requires_upload - we'll handle it via conversion
          assetsToUpload = assetsToUpload.filter((asset: ExtractedAsset) => 
            asset.category !== 'logo' && !asset.id.toLowerCase().includes('logo')
          );
        } else {
          // No logo at all - ensure it's in the assets to upload
          const hasLogoInAssets = assetsToUpload.some((asset: ExtractedAsset) => 
            asset.category === 'logo' || asset.id.toLowerCase().includes('logo')
          );
          
          if (!hasLogoInAssets) {
            // Add logo requirement explicitly
            assetsToUpload.unshift({
              id: `brand_logo_${neededVariant}`,
              description: `${neededVariant === 'light' ? 'White/light' : 'Dark/black'} version of your brand logo for the footer`,
              location: logoAnalysisResult.logo_position || 'center',
              category: 'logo',
              crop_hint: logoAnalysisResult.estimated_size ? {
                x_percent: 50 - (logoAnalysisResult.estimated_size.width_percent / 2),
                y_percent: 10,
                width_percent: logoAnalysisResult.estimated_size.width_percent,
                height_percent: logoAnalysisResult.estimated_size.height_percent
              } : undefined
            });
            console.log('Added logo requirement to assets needed');
          }
        }
      } else {
        // No logo visible in footer - still pre-populate brand logos if available
        if (brand.lightLogoUrl) {
          initialAssets['logo'] = brand.lightLogoUrl;
          initialAssets['brand_logo'] = brand.lightLogoUrl;
        }
        // Filter out any logo assets since footer doesn't have one
        assetsToUpload = assetsToUpload.filter((asset: ExtractedAsset) => 
          asset.category !== 'logo' && !asset.id.toLowerCase().includes('logo')
        );
      }

      setCollectedAssets(initialAssets);
      
      // Store extraction results
      setAssetsNeeded(assetsToUpload);
      setTextBasedElements(data.text_based_elements || []);
      const extractedClickables = data.clickable_elements || [];
      setClickableElements(extractedClickables);
      
      // Only use social platforms detected from the image
      const detectedSocialPlatforms = data.social_platforms || [];
      setSocialPlatforms(detectedSocialPlatforms);
      setExtractedStyles(data.styles || null);
      
      if (data.social_icon_color) {
        setSocialIconColor(data.social_icon_color);
        setIconColor(data.social_icon_color.replace('#', ''));
      }

      // Auto-populate social links ONLY with platforms detected from the image
      if (detectedSocialPlatforms.length > 0) {
        const emptyLinks = detectedSocialPlatforms.map((platform: string) => ({
          platform,
          url: '',
        }));
        setSocialLinks(emptyLinks);

        // Try to auto-detect the brand's *actual* profile URLs in the background
        console.log('Starting background social URL detection...');
        setIsDetectingSocials(true);
        supabase.functions
          .invoke('detect-footer-socials', {
            body: {
              footerImageUrl: imageUrl,
              brandName: brand.name,
              brandDomain: brand.domain,
              existingSocialLinks: brand.socialLinks || [],
            },
          })
          .then(({ data: socialData, error: socialError }) => {
            if (socialError) {
              console.error('Background social detection error:', socialError);
              toast.error('Could not auto-detect social URLs');
              return;
            }

            const detected = (socialData?.socialLinks || [])
              .filter((l: any) => detectedSocialPlatforms.includes(l.platform))
              .map((l: any) => ({
                platform: l.platform,
                url: l.url || '',
              }));

            if (detected.length > 0) {
              console.log('Background social detection complete:', detected);
              setSocialLinks(detected);
            }
          })
          .finally(() => {
            setIsDetectingSocials(false);
          });
      }

      // If there are assets that need upload OR logo conversion is needed, show appropriate UI
      if (assetsToUpload.length > 0) {
        setShowAssetCollectionModal(true);
      }

      // START LINK DETECTION IN BACKGROUND IMMEDIATELY
      if (extractedClickables.length > 0) {
        console.log('Starting background link detection...');
        setIsDetectingLinks(true);
        
        // Fire and forget - don't await
        supabase.functions.invoke('detect-footer-links', {
          body: { 
            clickableElements: extractedClickables,
            brandDomain: brand.domain,
            brandName: brand.name
          }
        }).then(({ data: linkData, error: linkError }) => {
          if (linkError) {
            console.error('Background link detection error:', linkError);
            toast.error('Failed to detect links');
          } else if (linkData?.success) {
            console.log('Background link detection complete:', linkData.links);
            setDetectedLinks(linkData.links || []);
            setApprovedLinks(linkData.links || []);
          }
        }).finally(() => {
          setIsDetectingLinks(false);
        });
      }

      toast.success(`Analysis complete`);
    } catch (error) {
      console.error('Asset extraction error:', error);
      toast.error('Failed to analyze image');
    } finally {
      setIsExtractingAssets(false);
    }
  }, [brand.domain, brand.name, brand.lightLogoUrl, brand.darkLogoUrl, brand.socialLinks]);

  // Update a single link URL
  const updateLinkUrl = useCallback((id: string, newUrl: string) => {
    setApprovedLinks(prev => prev.map(link => 
      link.id === id ? { ...link, searchedUrl: newUrl, needsManualUrl: false } : link
    ));
  }, []);

  // Handle asset collection complete
  const handleAssetCollectionComplete = useCallback((collected: Record<string, string>) => {
    setCollectedAssets(prev => ({ ...prev, ...collected }));
    setShowAssetCollectionModal(false);
    toast.success('Assets collected');
  }, []);

  // Handle auto-invert logo
  const handleAutoInvertLogo = useCallback(async () => {
    if (!logoConversionNeeded) return;
    
    setIsInvertingLogo(true);
    try {
      const { data, error } = await supabase.functions.invoke('invert-logo', {
        body: {
          logoUrl: logoConversionNeeded.sourceUrl,
          brandDomain: brand.domain,
          targetVariant: logoConversionNeeded.targetVariant
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to invert logo');
      }

      console.log('Logo inverted successfully:', data.invertedUrl);
      
      // Update collected assets with the inverted logo
      setCollectedAssets(prev => ({
        ...prev,
        'logo': data.invertedUrl,
        'brand_logo': data.invertedUrl,
        [`brand_logo_${logoConversionNeeded.targetVariant}`]: data.invertedUrl
      }));
      
      setLogoConversionNeeded(null);
      toast.success(`Created ${logoConversionNeeded.targetVariant} logo variant`);
    } catch (error) {
      console.error('Logo inversion error:', error);
      toast.error('Failed to invert logo. Please upload the correct variant manually.');
    } finally {
      setIsInvertingLogo(false);
    }
  }, [logoConversionNeeded, brand.domain]);

  // Handle manual logo upload for missing variant
  const handleUploadMissingLogo = useCallback(() => {
    if (!logoConversionNeeded) return;
    
    // Add the missing logo to assets needed
    setAssetsNeeded(prev => {
      const hasLogo = prev.some(a => a.category === 'logo');
      if (hasLogo) return prev;
      
      return [{
        id: `brand_logo_${logoConversionNeeded.targetVariant}`,
        description: `${logoConversionNeeded.targetVariant === 'light' ? 'White/light' : 'Dark/black'} version of your brand logo`,
        location: logoAnalysis?.logo_position || 'center',
        category: 'logo'
      }, ...prev];
    });
    
    setLogoConversionNeeded(null);
    setShowAssetCollectionModal(true);
  }, [logoConversionNeeded, logoAnalysis]);

  const handleCropComplete = useCallback(async (croppedImageData: string) => {
    setIsUploadingCrop(true);
    try {
      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { 
          imageData: croppedImageData,
          folder: `brands/${brand.domain}/footer-reference`
        }
      });

      if (error) throw error;
      
      setReferenceImageUrl(data.url);
      setSelectedCampaignImage(null);
      toast.success('Footer region extracted');
      
      // Extract assets from the cropped image
      await extractAssetsFromImage(data.url);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload cropped image');
    } finally {
      setIsUploadingCrop(false);
    }
  }, [brand.domain, extractAssetsFromImage]);

  const handleReferenceUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsUploadingReference(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        
        const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
          body: { 
            imageData: base64,
            folder: `brands/${brand.domain}/footer-reference`
          }
        });

        if (error) throw error;
        
        setReferenceImageUrl(data.url);
        setSourceType('image');
        toast.success('Reference image uploaded');
        
        // Extract assets from uploaded image
        await extractAssetsFromImage(data.url);
        setIsUploadingReference(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
      setIsUploadingReference(false);
    }
  }, [brand.domain, extractAssetsFromImage]);

  const handleFetchFigma = useCallback(async () => {
    if (!figmaUrl.trim()) {
      toast.error('Please enter a Figma URL');
      return;
    }

    setIsFetchingFigma(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-figma-design', {
        body: { figmaUrl }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch Figma design');
      }

      setFigmaData({
        design: data.design,
        designData: data.designData || null,
        imageUrls: data.imageUrls || {},
        exportedImageUrl: data.exportedImageUrl,
      });
      setSourceType('figma');
      
      if (data.exportedImageUrl) {
        setReferenceImageUrl(data.exportedImageUrl);
        // Extract assets from Figma export
        await extractAssetsFromImage(data.exportedImageUrl);
      }
      
      toast.success('Figma design fetched successfully');
    } catch (error) {
      console.error('Figma fetch error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch Figma design');
    } finally {
      setIsFetchingFigma(false);
    }
  }, [figmaUrl, extractAssetsFromImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleReferenceUpload(file);
  }, [handleReferenceUpload]);

  const handleGenerateFooter = async () => {
    setIsGenerating(true);
    setGenerationStatus('Uploading social icons...');
    
    try {
      // Upload social icons to Cloudinary
      const socialIconsData = await uploadAllSocialIcons(
        socialLinks.filter(l => l.url),
        iconColor,
        brand.domain
      );
      
      console.log('Social icons uploaded:', socialIconsData);

      const socialIconsForGeneration = socialIconsData.map((icon: any) => ({
        platform: icon.platform,
        url: icon.iconUrl
      }));

      setGenerationStatus('Generating footer HTML...');
      
      // Prepare links for generation
      const linksForGeneration = approvedLinks.map(link => ({
        id: link.id,
        text: link.text,
        url: link.searchedUrl
      }));
      
      // Merge brand logo URLs with collected assets (brand logos take priority)
      // This ensures the actual stored logo URLs are always available
      const assetsWithBrandLogos: Record<string, string> = { ...collectedAssets };
      
      // Auto-inject brand logos if available - these are the REAL logos to use
      if (brand.lightLogoUrl) {
        assetsWithBrandLogos['brand_logo_light'] = brand.lightLogoUrl;
        // Also add as generic "logo" for dark backgrounds (most common footer scenario)
        if (!assetsWithBrandLogos['logo'] && !assetsWithBrandLogos['brand_logo']) {
          assetsWithBrandLogos['logo'] = brand.lightLogoUrl;
        }
        console.log('Injected light logo from brand:', brand.lightLogoUrl);
      }
      if (brand.darkLogoUrl) {
        assetsWithBrandLogos['brand_logo_dark'] = brand.darkLogoUrl;
        console.log('Injected dark logo from brand:', brand.darkLogoUrl);
      }
      
      console.log('Final assets for generation:', assetsWithBrandLogos);
      
      // Use the unified footer-conversation function
      const { data, error } = await supabase.functions.invoke('footer-conversation', {
        body: {
          action: 'generate',
          referenceImageUrl,
          assets: assetsWithBrandLogos,  // Use merged assets with brand logos
          styles: extractedStyles,
          socialIcons: socialIconsForGeneration,
          links: linksForGeneration,
          conversationHistory: [] // Fresh conversation
        }
      });

      if (error) throw error;
      
      if (!data.success || !data.html) {
        throw new Error(data.error || 'Failed to generate footer HTML');
      }

      console.log('Footer generated, HTML length:', data.html.length);
      console.log('Conversation history length:', data.conversationHistory?.length || 0);

      // Hand off to studio for refinement with conversation history
      if (onOpenStudio && referenceImageUrl) {
        onOpenChange(false);
        onOpenStudio(
          referenceImageUrl, 
          data.html, 
          figmaData ? { design: figmaData.design, designData: figmaData.designData } : undefined,
          data.conversationHistory || []
        );
      } else {
        toast.success('Footer generated!');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate footer');
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'reference':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Choose your source</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload a screenshot or paste a Figma link to match the layout and style.
              </p>
            </div>

            {/* Source selection cards */}
            {!sourceType && (
              <div className="grid grid-cols-3 gap-3">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border/60 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  {isUploadingReference ? (
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                        <Image className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-xs">Upload Image</p>
                        <p className="text-[10px] text-muted-foreground">Drop or click</p>
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleReferenceUpload(e.target.files[0])}
                  />
                </div>

                <div
                  onClick={() => setSourceType('figma')}
                  className="border-2 border-dashed border-border/60 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                      <Figma className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-xs">Figma Link</p>
                      <p className="text-[10px] text-muted-foreground">Paste prototype</p>
                    </div>
                  </div>
                </div>

                <div
                  onClick={handleCampaignSourceClick}
                  className="border-2 border-dashed border-border/60 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  {isFetchingCampaigns ? (
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-xs">From Campaign</p>
                        <p className="text-[10px] text-muted-foreground">Select existing</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Figma URL input */}
            {sourceType === 'figma' && !figmaData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSourceType(null)} className="h-8 px-2">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Label className="text-sm font-medium">Paste Figma link</Label>
                </div>
                
                {/* Check if Figma token exists */}
                {hasFigmaToken === false ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md dark:bg-amber-950 dark:border-amber-800">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Figma not connected</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Set up your Figma Plugin Token in Integrations to use Figma designs.
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        onOpenChange(false);
                        window.location.href = '/settings';
                      }}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Go to Integrations
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="https://www.figma.com/design/..."
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                      className="w-full"
                    />
                    <Button onClick={handleFetchFigma} disabled={isFetchingFigma || !figmaUrl.trim()} className="w-full">
                      {isFetchingFigma ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching...</>
                      ) : (
                        <><Figma className="w-4 h-4 mr-2" />Fetch Design</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Figma preview */}
            {sourceType === 'figma' && figmaData && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Figma className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Figma design loaded</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setFigmaData(null); setSourceType(null); setFigmaUrl(''); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {figmaData.exportedImageUrl && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <img src={figmaData.exportedImageUrl} alt="Figma design preview" className="w-full" />
                  </div>
                )}
              </div>
            )}

            {/* Campaign selection */}
            {sourceType === 'campaign' && !selectedCampaignImage && !referenceImageUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setSourceType(null); setCampaigns([]); }} className="h-8 px-2">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Label className="text-sm font-medium">Select a campaign</Label>
                </div>
                
                {showingAllBrands && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                    No campaigns found for {brand.name}. Showing recent campaigns from all brands.
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      onClick={() => setSelectedCampaignImage(campaign.original_image_url || campaign.thumbnail_url)}
                      className="cursor-pointer rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 hover:shadow-md transition-all"
                    >
                      {(campaign.thumbnail_url || campaign.original_image_url) && (
                        <img src={campaign.thumbnail_url || campaign.original_image_url!} alt={campaign.name} className="w-full h-24 object-cover object-top" />
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{campaign.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {campaign.brandName || new Date(campaign.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campaign cropping view */}
            {sourceType === 'campaign' && selectedCampaignImage && !referenceImageUrl && (
              <div className="space-y-3">
                {isUploadingCrop ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Extracting footer region...</p>
                  </div>
                ) : (
                  <FooterCropSelector
                    imageUrl={selectedCampaignImage}
                    onCrop={handleCropComplete}
                    onCancel={() => setSelectedCampaignImage(null)}
                  />
                )}
              </div>
            )}

            {/* PROCESSING LOADING SCREEN */}
            {isProcessingReference && referenceImageUrl && (
              <div className="space-y-6 py-4">
                {/* Preview thumbnail */}
                <div className="flex justify-center">
                  <div className="relative w-48 rounded-lg border border-border overflow-hidden">
                    <img src={referenceImageUrl} alt="Processing" className="w-full opacity-80" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  </div>
                </div>
                
                {/* Main loading indicator */}
                <div className="text-center space-y-2">
                  <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                  <h3 className="font-medium">Analyzing your footer...</h3>
                  <p className="text-sm text-muted-foreground">
                    {dynamicMessage || "This usually takes 10-25 seconds"}
                  </p>
                </div>
                
                {/* Step checklist */}
                <div className="bg-muted/30 rounded-lg p-4 space-y-3 max-w-sm mx-auto">
                  <div className="flex items-center gap-3 text-sm">
                    {isUploadingReference || isUploadingCrop ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    )}
                    <span className={isUploadingReference || isUploadingCrop ? 'text-foreground' : 'text-muted-foreground'}>
                      Uploading image
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    {isExtractingAssets ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                    ) : !isUploadingReference && !isUploadingCrop && !isExtractingAssets ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={isExtractingAssets ? 'text-foreground' : (!isUploadingReference && !isUploadingCrop && !isExtractingAssets) ? 'text-muted-foreground' : 'text-muted-foreground/60'}>
                      Detecting layout & assets
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    {isDetectingLinks ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                    ) : clickableElements.length > 0 && !isDetectingLinks && !isExtractingAssets ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={isDetectingLinks ? 'text-foreground' : (clickableElements.length > 0 && !isDetectingLinks && !isExtractingAssets) ? 'text-muted-foreground' : 'text-muted-foreground/60'}>
                      Finding link URLs
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    {isDetectingSocials ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                    ) : socialPlatforms.length > 0 && !isDetectingSocials && !isExtractingAssets ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={isDetectingSocials ? 'text-foreground' : (socialPlatforms.length > 0 && !isDetectingSocials && !isExtractingAssets) ? 'text-muted-foreground' : 'text-muted-foreground/60'}>
                      Finding social URLs
                    </span>
                  </div>
                </div>
                
                {/* Elapsed time */}
                <p className="text-xs text-center text-muted-foreground">
                  {processingElapsed > 0 && `${processingElapsed}s elapsed`}
                </p>
                
                {/* Force continue after 30s */}
                {canForceSkip && (
                  <div className="text-center space-y-2">
                    <p className="text-xs text-amber-600">Taking longer than expected...</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsDetectingLinks(false);
                        setIsDetectingSocials(false);
                        setStep('links');
                      }}
                    >
                      Continue anyway
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Campaign-sourced image preview (only when NOT processing) */}
            {sourceType === 'campaign' && referenceImageUrl && !isProcessingReference && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Footer extracted</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setReferenceImageUrl(null); setSelectedCampaignImage(null); setCampaigns([]); setSourceType(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <img src={referenceImageUrl} alt="Footer reference" className="w-full max-h-48 object-contain" />
                </div>
              </div>
            )}

            {/* Uploaded image preview (only when NOT processing) */}
            {sourceType === 'image' && referenceImageUrl && !isProcessingReference && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Image uploaded</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setReferenceImageUrl(null); setSourceType(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <img src={referenceImageUrl} alt="Reference" className="w-full max-h-48 object-contain" />
                </div>
              </div>
            )}

            {/* Show extracted info summary (only when NOT processing) */}
            {!isProcessingReference && referenceImageUrl && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing image...
              </div>
            )}

            {/* Show extracted info summary */}
            {!isExtractingAssets && referenceImageUrl && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Analysis complete
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  {assetsNeeded.length > 0 && (
                    <p>• {assetsNeeded.length} asset{assetsNeeded.length !== 1 ? 's' : ''} {Object.keys(collectedAssets).length > 0 ? 'collected' : 'need collection'}</p>
                  )}
                  {textBasedElements.length > 0 && (
                    <p>• {textBasedElements.length} text/CSS element{textBasedElements.length !== 1 ? 's' : ''} (auto-handled)</p>
                  )}
                  {socialPlatforms.length > 0 && (
                    <p>• {socialPlatforms.length} social icon{socialPlatforms.length !== 1 ? 's' : ''} detected</p>
                  )}
                  {approvedLinks.length > 0 && (
                    <p>• {approvedLinks.filter(l => l.verified).length}/{approvedLinks.length} links verified</p>
                  )}
                  {logoAnalysis?.logo_visible && (
                    <p>• Logo detected ({logoAnalysis.needed_variant} variant needed)</p>
                  )}
                </div>
                
                {/* Button to open asset collection modal if there are uncollected assets */}
                {assetsNeeded.length > 0 && Object.keys(collectedAssets).length < assetsNeeded.length && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => setShowAssetCollectionModal(true)}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Collect Assets
                  </Button>
                )}
              </div>
            )}

            {/* Logo variant mismatch warning */}
            {logoConversionNeeded && !isProcessingReference && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Logo variant mismatch</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This footer has a {logoConversionNeeded.targetVariant === 'light' ? 'dark' : 'light'} background, 
                      but you only have a {logoConversionNeeded.targetVariant === 'light' ? 'dark' : 'light'} logo stored.
                      {logoConversionNeeded.canAutoConvert && ' We can automatically create an inverted version.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 ml-8">
                  {logoConversionNeeded.canAutoConvert && (
                    <Button 
                      size="sm" 
                      onClick={handleAutoInvertLogo}
                      disabled={isInvertingLogo}
                    >
                      {isInvertingLogo ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-1" />
                      )}
                      Auto-invert logo
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleUploadMissingLogo}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload {logoConversionNeeded.targetVariant} logo
                  </Button>
                </div>
              </div>
            )}

            {/* Skip link - disabled during processing */}
            <Button 
              variant="link" 
              className="w-full text-muted-foreground" 
              onClick={() => setStep('links')}
              disabled={isProcessingReference}
            >
              Skip - I don't have a reference
            </Button>
          </div>
        );

      case 'links':
        const emailActionLinks = approvedLinks.filter(l => l.category === 'email_action');
        const otherLinks = approvedLinks.filter(l => l.category !== 'email_action');
        
        return (
          <div className="space-y-4">
            <div className="text-center space-y-1 py-2">
              <h3 className="font-medium">Footer Links</h3>
              <p className="text-sm text-muted-foreground">
                {isDetectingLinks 
                  ? 'Searching for URLs...' 
                  : clickableElements.length > 0
                    ? 'Verified links show ✓. Enter missing URLs below.'
                    : 'No clickable elements detected.'}
              </p>
            </div>

            {isDetectingLinks && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Finding URLs...</span>
              </div>
            )}

            {!isDetectingLinks && otherLinks.length > 0 && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {otherLinks.map((link) => (
                  <div key={link.id} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                    <div className="w-5 flex-shrink-0">
                      {link.needsManualUrl ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : link.verified ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : null}
                    </div>
                    <span className="w-32 flex-shrink-0 font-medium text-sm truncate" title={link.text}>
                      {link.text}
                    </span>
                    <Input
                      value={link.searchedUrl}
                      onChange={(e) => updateLinkUrl(link.id, e.target.value)}
                      className={`flex-1 text-xs font-mono h-8 ${link.needsManualUrl ? 'border-amber-400 bg-amber-50/50' : ''}`}
                      placeholder="Enter URL..."
                    />
                    {link.searchedUrl && !link.searchedUrl.startsWith('{{') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => window.open(link.searchedUrl, '_blank')}
                        title="Test link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Email action links - shown separately */}
            {!isDetectingLinks && emailActionLinks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Email Actions (auto-filled)</p>
                <div className="bg-muted/30 rounded-lg px-3 py-2 space-y-0.5">
                  {emailActionLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-3 text-xs py-0.5">
                      <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span className="w-32 flex-shrink-0 text-muted-foreground">{link.text}</span>
                      <code className="font-mono text-[10px] text-muted-foreground">
                        {link.searchedUrl}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isDetectingLinks && clickableElements.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Link className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No clickable elements detected.</p>
                <p className="text-xs">Links can be added manually in the studio.</p>
              </div>
            )}
          </div>
        );

      case 'social':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-2">
              <h3 className="font-medium">Social Links</h3>
              <p className="text-sm text-muted-foreground">
                {socialPlatforms.length > 0
                  ? `Detected: ${socialPlatforms.join(', ')}. Add your profile URLs.`
                  : 'No social icons detected in the footer image.'}
              </p>
            </div>

            {socialPlatforms.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Icon Color</Label>
                  <div className="flex gap-2">
                    {['ffffff', '000000', brand.primaryColor?.replace('#', '')].filter(Boolean).map(color => (
                      <button
                        key={color}
                        onClick={() => setIconColor(color!)}
                        className={`w-8 h-8 rounded-md border-2 transition-all ${
                          iconColor === color ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                        }`}
                        style={{ backgroundColor: `#${color}` }}
                      />
                    ))}
                    <Input
                      value={`#${iconColor}`}
                      onChange={(e) => setIconColor(e.target.value.replace('#', ''))}
                      className="w-24 text-sm"
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                <SocialLinksEditor
                  socialLinks={socialLinks}
                  onChange={setSocialLinks}
                  iconColor={iconColor}
                />
              </>
            )}

            {socialPlatforms.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No social icons in this footer design.</p>
                <p className="text-xs">You can skip this step.</p>
              </div>
            )}
          </div>
        );

      case 'generate':
        return (
          <div className="space-y-4 text-center py-8">
            {isGenerating ? (
              <>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <div>
                  <h3 className="font-medium">{generationStatus || 'Generating your footer...'}</h3>
                  <p className="text-sm text-muted-foreground">
                    AI is creating HTML using your collected assets
                  </p>
                </div>
                {/* Render optional content during generation (e.g., ClickUp setup) */}
                {renderDuringGeneration && (
                  <div className="text-left max-w-md mx-auto">
                    {renderDuringGeneration}
                  </div>
                )}
              </>
            ) : (
              <>
                <Sparkles className="w-12 h-12 mx-auto text-primary" />
                <div>
                  <h3 className="font-medium">Ready to generate</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {Object.keys(collectedAssets).length > 0
                      ? `Using ${Object.keys(collectedAssets).length} custom asset${Object.keys(collectedAssets).length !== 1 ? 's' : ''} and ${socialLinks.filter(l => l.url).length} social link${socialLinks.filter(l => l.url).length !== 1 ? 's' : ''}.`
                      : 'Click below to generate your footer HTML.'}
                  </p>
                </div>
                <Button onClick={handleGenerateFooter} size="lg">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Footer
                </Button>
              </>
            )}
          </div>
        );
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'reference': 
        // Lock navigation while processing
        return !isProcessingReference;
      case 'links': return true;
      case 'social': return true;
      case 'generate': return false;
    }
  };
  
  // Allow override after 30 seconds
  const canForceSkip = processingElapsed >= 30;

  const getNextStep = (): Step | null => {
    switch (step) {
      case 'reference': return 'links';
      case 'links': return 'social';
      case 'social': return 'generate';
      case 'generate': return null;
    }
  };

  const getPrevStep = (): Step | null => {
    switch (step) {
      case 'reference': return null;
      case 'links': return 'reference';
      case 'social': return 'links';
      case 'generate': return 'social';
    }
  };

  const stepLabels: Record<Step, string> = {
    reference: 'Reference',
    links: 'Links',
    social: 'Social',
    generate: 'Generate',
  };

  const stepOrder: Step[] = ['reference', 'links', 'social', 'generate'];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Set Up Footer for {brand.name}</DialogTitle>
            <DialogDescription>
              Create a branded email footer that will be included in all your campaigns.
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator - now 4 steps */}
          <div className="flex items-center justify-center gap-1 py-2">
            {stepOrder.map((s, i) => (
              <div key={s} className="flex items-center">
                <div 
                  className={`w-2 h-2 rounded-full transition-colors ${
                    s === step ? 'bg-primary' : 
                    stepOrder.indexOf(s) < stepOrder.indexOf(step) 
                      ? 'bg-primary/40' : 'bg-muted'
                  }`}
                />
                {i < stepOrder.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground -mt-1">
            {stepLabels[step]}
          </p>

          {/* Content */}
          <div className="flex-1 overflow-auto py-2">
            {renderStepContent()}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => {
                const prev = getPrevStep();
                if (prev === 'reference') {
                  resetToReference();
                } else if (prev) {
                  setStep(prev);
                }
              }}
              disabled={!getPrevStep()}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {step === 'generate' ? (
              <Button onClick={handleGenerateFooter} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const next = getNextStep();
                  if (next) setStep(next);
                }}
                disabled={!canProceed() || !getNextStep()}
              >
                {step === 'reference' && isProcessingReference ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Asset Collection Modal - NEW SIMPLIFIED VERSION */}
      {referenceImageUrl && (
        <AssetCollectionModal
          open={showAssetCollectionModal}
          onOpenChange={setShowAssetCollectionModal}
          referenceImageUrl={referenceImageUrl}
          assetsNeeded={assetsNeeded}
          textBasedElements={textBasedElements}
          socialPlatforms={socialPlatforms}
          brandDomain={brand.domain}
          onComplete={handleAssetCollectionComplete}
        />
      )}
    </>
  );
}
