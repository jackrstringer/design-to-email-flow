import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, RefreshCw, Upload, AlertTriangle, ArrowRight, Globe, Palette, Image, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FooterBuilderModal } from '@/components/FooterBuilderModal';
import { BrandClickUpLocationSelector } from '@/components/BrandClickUpLocationSelector';
import { useAuth } from '@/hooks/useAuth';
import type { Brand } from '@/types/brand-assets';
import type { Json } from '@/integrations/supabase/types';

interface BrandOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrandCreated: (brand: Brand) => void;
}

interface LogoData {
  darkLogoUrl: string | null;
  darkLogoPublicId: string | null;
  lightLogoUrl: string | null;
  lightLogoPublicId: string | null;
  detectedType: 'dark' | 'light';
  hasOnlyOneVariant?: boolean;
  missingVariant?: 'dark' | 'light';
}

type Step = 'url' | 'analyze' | 'clickup' | 'footer';

export function BrandOnboardingModal({ 
  open, 
  onOpenChange, 
  onBrandCreated,
}: BrandOnboardingModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Step management
  const [step, setStep] = useState<Step>('url');
  
  // URL step
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Analysis data
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [accentColor, setAccentColor] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [textPrimaryColor, setTextPrimaryColor] = useState('');
  const [linkColor, setLinkColor] = useState('');
  const [klaviyoApiKey, setKlaviyoApiKey] = useState('');
  const [socialLinks, setSocialLinks] = useState<Brand['socialLinks']>([]);
  const [typography, setTypography] = useState<Brand['typography'] | null>(null);
  const [allLinks, setAllLinks] = useState<string[]>([]);
  
  // Logo state
  const [logoData, setLogoData] = useState<LogoData | null>(null);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null);
  const [colorScheme, setColorScheme] = useState<string | null>(null);
  
  // Footer step state
  const [createdBrand, setCreatedBrand] = useState<Brand | null>(null);
  const [showFooterBuilder, setShowFooterBuilder] = useState(false);
  const [isFooterGenerating, setIsFooterGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('url');
      setWebsiteUrl('');
      setBrandName('');
      setPrimaryColor('#3b82f6');
      setSecondaryColor('#64748b');
      setAccentColor('');
      setBackgroundColor('');
      setTextPrimaryColor('');
      setLinkColor('');
      setKlaviyoApiKey('');
      setSocialLinks([]);
      setTypography(null);
      setAllLinks([]);
      setLogoData(null);
      setOriginalLogoUrl(null);
      setColorScheme(null);
      setIsProcessingLogo(false);
      setCreatedBrand(null);
      setShowFooterBuilder(false);
      setIsFooterGenerating(false);
    }
  }, [open]);

  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.replace('www.', '').split('/')[0];
    }
  };

  // Process logo after analysis
  const processLogo = async (logoUrl: string, domain: string, scheme: string | null) => {
    if (!logoUrl || !logoUrl.startsWith('http')) return;

    setIsProcessingLogo(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-brand-logo', {
        body: { logoUrl, brandDomain: domain, colorScheme: scheme }
      });

      if (error) throw error;

      if (data?.success) {
        setLogoData({
          darkLogoUrl: data.darkLogoUrl || null,
          darkLogoPublicId: data.darkLogoPublicId || null,
          lightLogoUrl: data.lightLogoUrl || null,
          lightLogoPublicId: data.lightLogoPublicId || null,
          detectedType: data.detectedType,
          hasOnlyOneVariant: data.hasOnlyOneVariant || false,
          missingVariant: data.missingVariant,
        });
      }
    } catch (error) {
      console.error('Error processing logo:', error);
    } finally {
      setIsProcessingLogo(false);
    }
  };

  // Swap logos if auto-detection was wrong
  const swapLogos = () => {
    if (!logoData) return;
    const newDetectedType = logoData.detectedType === 'dark' ? 'light' : 'dark';
    setLogoData({
      darkLogoUrl: logoData.lightLogoUrl,
      darkLogoPublicId: logoData.lightLogoPublicId,
      lightLogoUrl: logoData.darkLogoUrl,
      lightLogoPublicId: logoData.darkLogoPublicId,
      detectedType: newDetectedType,
      hasOnlyOneVariant: logoData.hasOnlyOneVariant,
      missingVariant: newDetectedType === 'dark' ? 'light' : 'dark',
    });
  };

  // Remove a logo variant
  const removeLogo = (variant: 'dark' | 'light') => {
    if (!logoData) return;
    
    const newLogoData = { ...logoData };
    
    if (variant === 'dark') {
      newLogoData.darkLogoUrl = null;
      newLogoData.darkLogoPublicId = null;
    } else {
      newLogoData.lightLogoUrl = null;
      newLogoData.lightLogoPublicId = null;
    }
    
    // Check if both logos are now empty
    if (!newLogoData.darkLogoUrl && !newLogoData.lightLogoUrl) {
      setLogoData(null);
      return;
    }
    
    // Update variant status
    newLogoData.hasOnlyOneVariant = true;
    newLogoData.missingVariant = variant;
    
    setLogoData(newLogoData);
    toast.success(`${variant === 'dark' ? 'Dark' : 'Light'} logo removed`);
  };

  // Handle upload of logo variant (works whether logoData exists or not)
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, variant: 'dark' | 'light') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsProcessingLogo(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const domain = extractDomain(websiteUrl);
      
      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: {
          imageData: base64,
          folder: `brands/${domain}/logos`,
          publicId: `${variant}-logo`,
        },
      });

      if (error) throw error;

      if (logoData) {
        // Update existing logoData
        const hasOtherVariant = variant === 'dark' ? !!logoData.lightLogoUrl : !!logoData.darkLogoUrl;
        setLogoData({
          ...logoData,
          hasOnlyOneVariant: !hasOtherVariant,
          missingVariant: hasOtherVariant ? undefined : (variant === 'dark' ? 'light' : 'dark'),
          [variant === 'dark' ? 'darkLogoUrl' : 'lightLogoUrl']: data.url,
          [variant === 'dark' ? 'darkLogoPublicId' : 'lightLogoPublicId']: data.publicId,
        });
      } else {
        // Create new logoData
        setLogoData({
          darkLogoUrl: variant === 'dark' ? data.url : null,
          darkLogoPublicId: variant === 'dark' ? data.publicId : null,
          lightLogoUrl: variant === 'light' ? data.url : null,
          lightLogoPublicId: variant === 'light' ? data.publicId : null,
          detectedType: variant,
          hasOnlyOneVariant: true,
          missingVariant: variant === 'dark' ? 'light' : 'dark',
        });
      }
      
      toast.success(`${variant === 'dark' ? 'Dark' : 'Light'} logo uploaded`);
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const applyAnalysisData = async (data: any, domain: string) => {
    if (data?.colors) {
      setPrimaryColor(data.colors.primary || '#3b82f6');
      setSecondaryColor(data.colors.secondary || '#64748b');
      setAccentColor(data.colors.accent || '');
      setBackgroundColor(data.colors.background || '');
      setTextPrimaryColor(data.colors.textPrimary || '');
      setLinkColor(data.colors.link || '');
    }

    if (data?.typography || data?.fonts || data?.spacing || data?.components) {
      setTypography({
        ...(data.typography || {}),
        fonts: data.fonts || [],
        spacing: data.spacing || null,
        components: data.components || null,
      });
    }

    if (data?.socialLinks && Array.isArray(data.socialLinks)) {
      const validPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'];
      const validLinks = data.socialLinks.filter(
        (link: any) => validPlatforms.includes(link.platform)
      ) as Brand['socialLinks'];
      setSocialLinks(validLinks);
    }

    if (data?.allLinks && Array.isArray(data.allLinks)) {
      setAllLinks(data.allLinks);
    }

    if (data?.logo) {
      setOriginalLogoUrl(data.logo);
    }
    if (data?.colorScheme) {
      setColorScheme(data.colorScheme);
    }

    // Extract brand name from domain
    const nameParts = domain.split('.');
    const suggestedName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
    setBrandName(suggestedName);

    // Process logo if available
    if (data?.logo && data.logo.startsWith('http')) {
      processLogo(data.logo, domain, data.colorScheme || null);
    }
  };

  const handleAnalyze = async () => {
    if (!websiteUrl) {
      toast.error('Please enter a website URL');
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl }
      });

      if (error) throw error;

      const domain = extractDomain(websiteUrl);
      await applyAnalysisData(data, domain);

      setStep('analyze');
      toast.success('Brand analyzed successfully');
    } catch (error) {
      console.error('Error analyzing brand:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      const domain = extractDomain(websiteUrl);
      const suggestedName = domain.split('.')[0];
      setBrandName(suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1));
      setStep('analyze');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleContinueToClickUp = async () => {
    if (!brandName.trim()) {
      toast.error('Please enter a brand name');
      return;
    }

    if (!klaviyoApiKey.trim()) {
      toast.error('Please enter a Klaviyo API key');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to create a brand');
      return;
    }

    setIsSaving(true);
    try {
      const domain = extractDomain(websiteUrl);

      const { data, error } = await supabase
        .from('brands')
        .insert({
          user_id: user.id,
          name: brandName.trim(),
          domain,
          website_url: websiteUrl,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          accent_color: accentColor || null,
          background_color: backgroundColor || null,
          text_primary_color: textPrimaryColor || null,
          link_color: linkColor || null,
          social_links: socialLinks as unknown as Json,
          all_links: allLinks as unknown as Json,
          typography: typography as unknown as Json,
          klaviyo_api_key: klaviyoApiKey.trim(),
          dark_logo_url: logoData?.darkLogoUrl || null,
          dark_logo_public_id: logoData?.darkLogoPublicId || null,
          light_logo_url: logoData?.lightLogoUrl || null,
          light_logo_public_id: logoData?.lightLogoPublicId || null,
        })
        .select()
        .single();

      if (error) throw error;

      const newBrand: Brand = {
        id: data.id,
        name: data.name,
        domain: data.domain,
        websiteUrl: data.website_url || undefined,
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        accentColor: data.accent_color || undefined,
        backgroundColor: data.background_color || undefined,
        textPrimaryColor: data.text_primary_color || undefined,
        linkColor: data.link_color || undefined,
        socialLinks: socialLinks,
        allLinks: allLinks,
        klaviyoApiKey: data.klaviyo_api_key || undefined,
        footerConfigured: false,
        typography: typography || undefined,
        darkLogoUrl: data.dark_logo_url || undefined,
        lightLogoUrl: data.light_logo_url || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      toast.success('Brand created! Now let\'s connect ClickUp.');
      setCreatedBrand(newBrand);
      setStep('clickup');
    } catch (error) {
      console.error('Error creating brand:', error);
      toast.error('Failed to create brand');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClickUpComplete = () => {
    setStep('footer');
    setShowFooterBuilder(true);
  };

  const handleClickUpSkip = () => {
    setStep('footer');
    setShowFooterBuilder(true);
  };

  const handleFooterSaved = () => {
    if (createdBrand) {
      onBrandCreated({ ...createdBrand, footerConfigured: true });
    }
    setShowFooterBuilder(false);
    onOpenChange(false);
  };

  const handleSkipFooter = () => {
    if (createdBrand) {
      onBrandCreated(createdBrand);
    }
    setShowFooterBuilder(false);
    onOpenChange(false);
  };


  return (
    <>
      <Dialog open={open && !showFooterBuilder} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === 'url' && 'Add New Brand'}
              {step === 'analyze' && `Set up ${brandName || 'Brand'}`}
              {step === 'footer' && 'Creating Footer...'}
            </DialogTitle>
            <DialogDescription>
              {step === 'url' && 'Enter the brand\'s website URL to get started.'}
              {step === 'analyze' && 'Review the detected brand info and add your Klaviyo API key.'}
              {step === 'footer' && 'Your footer is being generated.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: URL Entry */}
          {step === 'url' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Website URL</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="https://example.com"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      disabled={isAnalyzing}
                      className="pl-9"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && websiteUrl) {
                          handleAnalyze();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAnalyze} 
                  disabled={isAnalyzing || !websiteUrl}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze Brand
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Analysis Results + Logo Upload */}
          {step === 'analyze' && (
            <div className="space-y-4 py-4">
              {/* Brand Name */}
              <div className="space-y-2">
                <Label>Brand Name</Label>
                <Input
                  placeholder="Brand Name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>

              {/* Colors preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Palette className="h-3 w-3" />
                  Detected Colors
                </Label>
                <div className="flex gap-2">
                  {[primaryColor, secondaryColor, accentColor, backgroundColor, textPrimaryColor, linkColor]
                    .filter(Boolean)
                    .map((color, i) => (
                      <div 
                        key={i}
                        className="w-8 h-8 rounded-md shadow-sm ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))
                  }
                </div>
              </div>

              {/* Logo Preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Image className="h-3 w-3" />
                  Brand Logos
                </Label>
                {isProcessingLogo ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing logo...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-4">
                      {/* Dark logo (for light backgrounds) */}
                      <div className="flex-1 space-y-1">
                        <span className="text-xs text-muted-foreground">Dark (for light bg)</span>
                        {logoData?.darkLogoUrl ? (
                          <div className="relative group">
                            <div className="p-2 bg-white rounded-md border flex items-center justify-center h-12">
                              <img 
                                src={logoData.darkLogoUrl} 
                                alt="Dark logo" 
                                className="max-h-8 max-w-full object-contain"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeLogo('dark')}
                              className="absolute -top-2 -right-2 p-1 bg-destructive rounded-full text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-12 rounded-md border border-dashed border-muted-foreground/30 bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                            <span className="text-xs text-muted-foreground">Upload dark logo</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleLogoUpload(e, 'dark')}
                            />
                          </label>
                        )}
                      </div>
                      {/* Light logo (for dark backgrounds) */}
                      <div className="flex-1 space-y-1">
                        <span className="text-xs text-muted-foreground">Light (for dark bg)</span>
                        {logoData?.lightLogoUrl ? (
                          <div className="relative group">
                            <div className="p-2 bg-gray-900 rounded-md border flex items-center justify-center h-12">
                              <img 
                                src={logoData.lightLogoUrl} 
                                alt="Light logo" 
                                className="max-h-8 max-w-full object-contain"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeLogo('light')}
                              className="absolute -top-2 -right-2 p-1 bg-destructive rounded-full text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center h-12 rounded-md border border-dashed border-muted-foreground/30 bg-gray-900 cursor-pointer hover:bg-gray-800 transition-colors">
                            <span className="text-xs text-gray-400">Upload light logo</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleLogoUpload(e, 'light')}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    
                    {/* Missing variant warning */}
                    {logoData?.hasOnlyOneVariant && logoData?.missingVariant && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                          <p className="font-medium">Missing {logoData.missingVariant === 'light' ? 'light' : 'dark'} logo</p>
                          <p className="text-amber-700">
                            {logoData.missingVariant === 'light' 
                              ? 'Upload a light version for dark backgrounds (like footers)' 
                              : 'Upload a dark version for light backgrounds'}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {logoData?.darkLogoUrl && logoData?.lightLogoUrl && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={swapLogos}
                        className="text-xs h-7"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Swap if incorrect
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Klaviyo API Key */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="font-medium">Klaviyo API Key *</Label>
                <Input
                  type="password"
                  placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={klaviyoApiKey}
                  onChange={(e) => setKlaviyoApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Find this in Klaviyo → Settings → API Keys (Private Key)
                </p>
              </div>

              {/* Social Links Preview */}
              {socialLinks.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Detected Social Links</Label>
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map((link, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-muted rounded">
                        {link.platform}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setStep('url')}>
                  Back
                </Button>
                <Button 
                  onClick={handleContinueToClickUp} 
                  disabled={isSaving || !brandName || !klaviyoApiKey}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: ClickUp Location Selection */}
          {step === 'clickup' && createdBrand && (
            <div className="py-4">
              <BrandClickUpLocationSelector
                brandId={createdBrand.id}
                onComplete={handleClickUpComplete}
                onSkip={handleClickUpSkip}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer Builder Modal - no ClickUp overlay, it's handled in previous step */}
      {createdBrand && showFooterBuilder && (
        <FooterBuilderModal
          open={showFooterBuilder}
          onOpenChange={(open) => {
            if (!open) handleSkipFooter();
          }}
          brand={createdBrand}
          onFooterSaved={handleFooterSaved}
          onGenerationStateChange={setIsFooterGenerating}
          onOpenStudio={(referenceImageUrl, footerHtml, figmaDesignData) => {
            onOpenChange(false);
            setShowFooterBuilder(false);
            navigate(`/footer-editor/${createdBrand.id}`, {
              state: {
                referenceImageUrl,
                footerHtml,
                footerName: 'New Footer',
                figmaDesignData,
              }
            });
          }}
        />
      )}
    </>
  );
}
