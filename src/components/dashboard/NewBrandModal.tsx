import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
import type { Brand } from '@/types/brand-assets';
import type { Json } from '@/integrations/supabase/types';

interface NewBrandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDomain: string | null;
  onBrandCreated: (brand: Brand) => void;
}

export function NewBrandModal({ open, onOpenChange, initialDomain, onBrandCreated }: NewBrandModalProps) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [accentColor, setAccentColor] = useState('');
  const [klaviyoApiKey, setKlaviyoApiKey] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [socialLinks, setSocialLinks] = useState<Brand['socialLinks']>([]);
  const [typography, setTypography] = useState<Brand['typography'] | null>(null);

  useEffect(() => {
    if (initialDomain) {
      setWebsiteUrl(`https://${initialDomain}`);
    }
  }, [initialDomain]);

  useEffect(() => {
    if (!open) {
      // Reset state when modal closes
      setWebsiteUrl('');
      setBrandName('');
      setPrimaryColor('#3b82f6');
      setSecondaryColor('#64748b');
      setAccentColor('');
      setKlaviyoApiKey('');
      setAnalyzed(false);
      setSocialLinks([]);
      setTypography(null);
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

      if (data?.colors) {
        setPrimaryColor(data.colors.primary || '#3b82f6');
        setSecondaryColor(data.colors.secondary || '#64748b');
        setAccentColor(data.colors.accent || '');
      }

      if (data?.typography) {
        setTypography(data.typography);
      }

      if (data?.socialLinks && Array.isArray(data.socialLinks)) {
        // Filter to only valid platform types
        const validPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'];
        const validLinks = data.socialLinks.filter(
          (link: any) => validPlatforms.includes(link.platform)
        ) as Brand['socialLinks'];
        setSocialLinks(validLinks);
      }

      // Try to extract brand name from domain
      const domain = extractDomain(websiteUrl);
      const nameParts = domain.split('.');
      const suggestedName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
      setBrandName(suggestedName);

      setAnalyzed(true);
      toast.success('Brand analyzed successfully');
    } catch (error) {
      console.error('Error analyzing brand:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      setAnalyzed(true); // Allow manual entry
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
          social_links: socialLinks as unknown as Json,
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
        socialLinks: socialLinks,
        allLinks: [],
        klaviyoApiKey: data.klaviyo_api_key || undefined,
        footerConfigured: false,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      toast.success('Brand created successfully');
      onBrandCreated(newBrand);
    } catch (error) {
      console.error('Error creating brand:', error);
      toast.error('Failed to create brand');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Brand</DialogTitle>
          <DialogDescription>
            Enter the brand's website URL to auto-detect brand information, then add their Klaviyo API key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Website URL + Analyze */}
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
                onClick={handleAnalyze} 
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

              {/* Colors */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Primary</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Secondary</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Accent</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor || '#ffffff'}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="text-xs h-8"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              {/* Klaviyo API Key */}
              <div className="space-y-2">
                <Label>Klaviyo API Key *</Label>
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
  );
}
