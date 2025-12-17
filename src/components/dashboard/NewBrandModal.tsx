import { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
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
import type { Brand } from '@/types/brand-assets';
import type { Json } from '@/integrations/supabase/types';

interface NewBrandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDomain: string | null;
  onBrandCreated: (brand: Brand) => void;
  backgroundAnalysis?: Promise<any> | null;
}

export function NewBrandModal({ 
  open, 
  onOpenChange, 
  initialDomain, 
  onBrandCreated,
  backgroundAnalysis 
}: NewBrandModalProps) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [accentColor, setAccentColor] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [textPrimaryColor, setTextPrimaryColor] = useState('');
  const [linkColor, setLinkColor] = useState('');
  const [klaviyoApiKey, setKlaviyoApiKey] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [socialLinks, setSocialLinks] = useState<Brand['socialLinks']>([]);
  const [typography, setTypography] = useState<Brand['typography'] | null>(null);
  const [allLinks, setAllLinks] = useState<string[]>([]);
  
  // Footer builder state
  const [showFooterBuilder, setShowFooterBuilder] = useState(false);
  const [createdBrand, setCreatedBrand] = useState<Brand | null>(null);

  // Handle background analysis result when modal opens with initialDomain
  useEffect(() => {
    if (open && initialDomain && backgroundAnalysis) {
      setWebsiteUrl(`https://${initialDomain}`);
      setIsAnalyzing(true);
      
      // Wait for background analysis to complete
      backgroundAnalysis.then(({ data, error }) => {
        if (!error && data) {
          applyAnalysisData(data, initialDomain);
        } else {
          // Analysis failed - allow manual entry
          const suggestedName = initialDomain.split('.')[0];
          setBrandName(suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1));
        }
        setAnalyzed(true);
        setIsAnalyzing(false);
      }).catch(() => {
        setAnalyzed(true);
        setIsAnalyzing(false);
      });
    } else if (open && initialDomain && !backgroundAnalysis) {
      // No background analysis - start one
      setWebsiteUrl(`https://${initialDomain}`);
      handleAnalyze(`https://${initialDomain}`);
    }
  }, [open, initialDomain, backgroundAnalysis]);

  useEffect(() => {
    if (!open) {
      // Reset state when modal closes
      setWebsiteUrl('');
      setBrandName('');
      setPrimaryColor('#3b82f6');
      setSecondaryColor('#64748b');
      setAccentColor('');
      setBackgroundColor('');
      setTextPrimaryColor('');
      setLinkColor('');
      setKlaviyoApiKey('');
      setAnalyzed(false);
      setSocialLinks([]);
      setTypography(null);
      setAllLinks([]);
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

  const applyAnalysisData = (data: any, domain: string) => {
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

    // Extract brand name from domain
    const nameParts = domain.split('.');
    const suggestedName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
    setBrandName(suggestedName);
  };

  const handleAnalyze = async (url?: string) => {
    const targetUrl = url || websiteUrl;
    if (!targetUrl) {
      toast.error('Please enter a website URL');
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl: targetUrl }
      });

      if (error) throw error;

      const domain = extractDomain(targetUrl);
      applyAnalysisData(data, domain);

      setAnalyzed(true);
      toast.success('Brand analyzed successfully');
    } catch (error) {
      console.error('Error analyzing brand:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      // Still allow manual entry
      const domain = extractDomain(targetUrl);
      const suggestedName = domain.split('.')[0];
      setBrandName(suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1));
      setAnalyzed(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!brandName.trim()) {
      toast.error('Please enter a brand name');
      return;
    }

    if (!klaviyoApiKey.trim()) {
      toast.error('Please enter a Klaviyo API key');
      return;
    }

    setIsSaving(true);
    try {
      const domain = extractDomain(websiteUrl);

      const { data, error } = await supabase
        .from('brands')
        .insert({
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
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      toast.success('Brand created! Now let\'s set up your footer.');
      setCreatedBrand(newBrand);
      setShowFooterBuilder(true);
    } catch (error) {
      console.error('Error creating brand:', error);
      toast.error('Failed to create brand');
    } finally {
      setIsSaving(false);
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialDomain ? `Add ${initialDomain.split('.')[0].charAt(0).toUpperCase() + initialDomain.split('.')[0].slice(1)}` : 'Add New Brand'}
          </DialogTitle>
          <DialogDescription>
            {initialDomain 
              ? 'We detected a new brand. Enter the Klaviyo API key to continue.'
              : 'Enter the brand\'s website URL to auto-detect brand information.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Analysis status for auto-detected brands */}
          {initialDomain && isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing brand colors and typography...</span>
            </div>
          )}

          {initialDomain && analyzed && !isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="w-4 h-4" />
              <span>Brand info detected</span>
            </div>
          )}

          {/* Website URL - only show input if not auto-detected */}
          {!initialDomain && (
            <div className="space-y-2">
              <Label>Website URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  disabled={isAnalyzing}
                />
                <Button 
                  onClick={() => handleAnalyze()} 
                  disabled={isAnalyzing || !websiteUrl}
                  variant="secondary"
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Analyze'
                  )}
                </Button>
              </div>
            </div>
          )}

          {analyzed && (
            <>
              {/* Brand Name */}
              <div className="space-y-2">
                <Label>Brand Name</Label>
                <Input
                  placeholder="Brand Name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>

              {/* Colors - compact preview */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Detected Colors</Label>
                <div className="flex gap-2">
                  {[primaryColor, secondaryColor, accentColor, backgroundColor, textPrimaryColor, linkColor]
                    .filter(Boolean)
                    .map((color, i) => (
                      <div 
                        key={i}
                        className="w-6 h-6 rounded-md shadow-sm ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))
                  }
                </div>
              </div>

              {/* Klaviyo API Key - PRIMARY INPUT */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="font-medium">Klaviyo API Key *</Label>
                <Input
                  type="password"
                  placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={klaviyoApiKey}
                  onChange={(e) => setKlaviyoApiKey(e.target.value)}
                  autoFocus={!!initialDomain}
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!analyzed || isSaving || !brandName || !klaviyoApiKey}
          >
            {isSaving ? 'Creating...' : 'Create Brand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Footer Builder Modal */}
    {createdBrand && (
      <FooterBuilderModal
        open={showFooterBuilder}
        onOpenChange={(open) => {
          if (!open) handleSkipFooter();
        }}
        brand={createdBrand}
        onFooterSaved={handleFooterSaved}
      />
    )}
  </>
  );
}
