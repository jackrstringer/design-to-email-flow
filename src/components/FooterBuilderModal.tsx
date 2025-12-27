import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, ChevronRight, ChevronLeft, X, Sparkles, Figma, Image, Layers, Check, Link, ExternalLink, AlertCircle } from 'lucide-react';
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
}

type Step = 'reference' | 'links' | 'social' | 'generate';
type SourceType = 'image' | 'figma' | 'campaign' | null;

interface DetectedLink {
  id: string;
  text: string;
  category: 'navigation' | 'button' | 'social' | 'email_action';
  searchedUrl: string;
  verified: boolean;
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

export function FooterBuilderModal({ open, onOpenChange, brand, onFooterSaved, onOpenStudio, initialCampaignImageUrl }: FooterBuilderModalProps) {
  const [step, setStep] = useState<Step>('reference');
  const [sourceType, setSourceType] = useState<SourceType>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  
  // Figma state
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [figmaData, setFigmaData] = useState<FigmaDesignData | null>(null);
  
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
  
  // Asset collection modal state
  const [showAssetCollectionModal, setShowAssetCollectionModal] = useState(false);
  const [collectedAssets, setCollectedAssets] = useState<Record<string, string>>({});
  
  // Links state - NEW
  const [detectedLinks, setDetectedLinks] = useState<DetectedLink[]>([]);
  const [isDetectingLinks, setIsDetectingLinks] = useState(false);
  const [approvedLinks, setApprovedLinks] = useState<DetectedLink[]>([]);
  
  // Social state
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(brand.socialLinks || []);
  const [iconColor, setIconColor] = useState('ffffff');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const { data, error } = await supabase.functions.invoke('extract-section-assets', {
        body: { referenceImageUrl: imageUrl }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to extract assets');
      }

      console.log('Extracted assets:', data);

      // Store extraction results
      setAssetsNeeded(data.requires_upload || []);
      setTextBasedElements(data.text_based_elements || []);
      setClickableElements(data.clickable_elements || []);
      setSocialPlatforms(data.social_platforms || []);
      setExtractedStyles(data.styles || null);
      
      if (data.social_icon_color) {
        setSocialIconColor(data.social_icon_color);
        setIconColor(data.social_icon_color.replace('#', ''));
      }

      // Auto-populate social links based on detected platforms
      if (data.social_platforms && data.social_platforms.length > 0) {
        const existingPlatforms = new Set(socialLinks.map(l => l.platform));
        const newLinks = [...socialLinks];
        
        for (const platform of data.social_platforms) {
          if (!existingPlatforms.has(platform)) {
            newLinks.push({ platform, url: '' });
          }
        }
        
        setSocialLinks(newLinks);
      }

      // If there are assets that need upload, show the collection modal
      if (data.requires_upload && data.requires_upload.length > 0) {
        setShowAssetCollectionModal(true);
      }

      toast.success(`Analysis complete`);
    } catch (error) {
      console.error('Asset extraction error:', error);
      toast.error('Failed to analyze image');
    } finally {
      setIsExtractingAssets(false);
    }
  }, [socialLinks]);

  // Detect links for clickable elements
  const detectLinksForElements = useCallback(async () => {
    if (clickableElements.length === 0) {
      toast.info('No clickable elements detected');
      return;
    }

    setIsDetectingLinks(true);
    try {
      const { data, error } = await supabase.functions.invoke('detect-footer-links', {
        body: { 
          clickableElements,
          brandDomain: brand.domain,
          brandName: brand.name
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to detect links');
      }

      console.log('Detected links:', data.links);
      setDetectedLinks(data.links || []);
      setApprovedLinks(data.links || []); // Pre-fill with detected URLs
      toast.success(`Found ${data.links?.length || 0} links`);
    } catch (error) {
      console.error('Link detection error:', error);
      toast.error('Failed to detect links');
    } finally {
      setIsDetectingLinks(false);
    }
  }, [clickableElements, brand.domain, brand.name]);

  // Update a single link URL
  const updateLinkUrl = useCallback((id: string, newUrl: string) => {
    setApprovedLinks(prev => prev.map(link => 
      link.id === id ? { ...link, searchedUrl: newUrl } : link
    ));
  }, []);

  // Handle asset collection complete
  const handleAssetCollectionComplete = useCallback((collected: Record<string, string>) => {
    setCollectedAssets(collected);
    setShowAssetCollectionModal(false);
    toast.success('Assets collected');
  }, []);

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
      
      // Use the unified footer-conversation function
      const { data, error } = await supabase.functions.invoke('footer-conversation', {
        body: {
          action: 'generate',
          referenceImageUrl,
          assets: collectedAssets,
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
                    <p className="text-sm text-muted-foreground">Analyzing image...</p>
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

            {/* Campaign-sourced image preview */}
            {sourceType === 'campaign' && referenceImageUrl && (
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

            {/* Uploaded image preview */}
            {sourceType === 'image' && referenceImageUrl && (
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

            {/* Show extraction status */}
            {isExtractingAssets && (
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

            <Button variant="link" className="w-full text-muted-foreground" onClick={() => setStep('links')}>
              Skip - I don't have a reference
            </Button>
          </div>
        );

      case 'links':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Footer Links</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {clickableElements.length > 0
                  ? `We detected ${clickableElements.length} clickable element${clickableElements.length !== 1 ? 's' : ''}. Confirm or edit the URLs.`
                  : 'No clickable elements detected.'}
              </p>
            </div>

            {clickableElements.length > 0 && approvedLinks.length === 0 && (
              <Button 
                onClick={detectLinksForElements} 
                disabled={isDetectingLinks}
                className="w-full"
              >
                {isDetectingLinks ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching for URLs...</>
                ) : (
                  <><Link className="w-4 h-4 mr-2" />Detect Link URLs</>
                )}
              </Button>
            )}

            {approvedLinks.length > 0 && (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {approvedLinks.map((link) => (
                  <div key={link.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{link.text}</span>
                        <Badge variant={link.category === 'email_action' ? 'secondary' : 'outline'} className="text-xs">
                          {link.category}
                        </Badge>
                      </div>
                      {link.verified ? (
                        <Badge variant="default" className="text-xs bg-green-600">
                          <Check className="w-3 h-3 mr-1" />Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                          <AlertCircle className="w-3 h-3 mr-1" />Review
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={link.searchedUrl}
                        onChange={(e) => updateLinkUrl(link.id, e.target.value)}
                        className="text-xs font-mono"
                        placeholder="https://..."
                      />
                      {!link.searchedUrl.startsWith('{{') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => window.open(link.searchedUrl, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {clickableElements.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Link className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No clickable elements detected in the reference.</p>
                <p className="text-xs">Links can be added manually later.</p>
              </div>
            )}
          </div>
        );

      case 'social':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Social Links</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {socialPlatforms.length > 0
                  ? `We detected ${socialPlatforms.join(', ')} icons. Add your profile URLs.`
                  : 'Add your social media links.'}
              </p>
            </div>

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
      case 'reference': return true;
      case 'links': return true;
      case 'social': return true;
      case 'generate': return false;
    }
  };

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
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-lg">
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
                if (prev) setStep(prev);
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
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
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
