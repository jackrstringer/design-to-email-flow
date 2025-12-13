import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand, SocialLink } from '@/types/brand-assets';
import { extractDomain } from '@/hooks/useBrands';

interface NewBrandSetupModalProps {
  open: boolean;
  websiteUrl: string;
  onComplete: (brand: Brand) => void;
  onClose: () => void;
}

interface LogoUploadZoneProps {
  label: string;
  logoUrl?: string;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  bgClass: string;
}

const LogoUploadZone = ({ label, logoUrl, isUploading, onUpload, onRemove, bgClass }: LogoUploadZoneProps) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  }, [onUpload]);

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div
        className={`relative h-24 rounded-lg border-2 border-dashed border-border ${bgClass} flex items-center justify-center transition-colors hover:border-primary`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : logoUrl ? (
          <>
            <img src={logoUrl} alt={label} className="max-h-16 max-w-[80%] object-contain" />
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <label className="cursor-pointer flex flex-col items-center gap-1 text-muted-foreground">
            <Upload className="w-5 h-5" />
            <span className="text-xs">Drop or click</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export const NewBrandSetupModal = ({
  open,
  websiteUrl,
  onComplete,
  onClose,
}: NewBrandSetupModalProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadingDark, setIsUploadingDark] = useState(false);
  const [isUploadingLight, setIsUploadingLight] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [allLinks, setAllLinks] = useState<string[]>([]);
  const [darkLogoUrl, setDarkLogoUrl] = useState<string>();
  const [darkLogoPublicId, setDarkLogoPublicId] = useState<string>();
  const [lightLogoUrl, setLightLogoUrl] = useState<string>();
  const [lightLogoPublicId, setLightLogoPublicId] = useState<string>();
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Auto-analyze when modal opens
  useState(() => {
    if (open && websiteUrl && !hasAnalyzed) {
      analyzeBrand();
    }
  });

  const analyzeBrand = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl }
      });

      if (error) throw error;

      // Extract brand name from domain
      const domain = extractDomain(websiteUrl);
      const name = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      setBrandName(name);

      if (data.colors?.primary) setPrimaryColor(data.colors.primary);
      if (data.colors?.secondary) setSecondaryColor(data.colors.secondary);
      if (data.socialLinks) setSocialLinks(data.socialLinks);
      if (data.allLinks) setAllLinks(data.allLinks);
      
      setHasAnalyzed(true);
      toast.success('Brand analyzed! Please upload logos to continue.');
    } catch (error) {
      console.error('Brand analysis failed:', error);
      toast.error('Failed to analyze brand. Please enter details manually.');
      
      // Set default brand name from domain
      const domain = extractDomain(websiteUrl);
      const name = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      setBrandName(name);
      setHasAnalyzed(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const uploadLogo = async (file: File, type: 'dark' | 'light') => {
    const setUploading = type === 'dark' ? setIsUploadingDark : setIsUploadingLight;
    setUploading(true);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageData: base64, folder: 'brand-assets' }
      });

      if (error) throw error;

      if (type === 'dark') {
        setDarkLogoUrl(data.url);
        setDarkLogoPublicId(data.publicId);
      } else {
        setLightLogoUrl(data.url);
        setLightLogoPublicId(data.publicId);
      }

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded!`);
    } catch (error) {
      console.error('Logo upload failed:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!darkLogoUrl || !lightLogoUrl) {
      toast.error('Please upload both logos');
      return;
    }

    setIsSaving(true);
    try {
      const domain = extractDomain(websiteUrl);

      const { data, error } = await supabase
        .from('brands')
        .insert({
          name: brandName,
          domain,
          website_url: websiteUrl,
          dark_logo_url: darkLogoUrl,
          dark_logo_public_id: darkLogoPublicId,
          light_logo_url: lightLogoUrl,
          light_logo_public_id: lightLogoPublicId,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          social_links: socialLinks as any,
          all_links: allLinks as any,
          footer_configured: false,
        })
        .select()
        .single();

      if (error) throw error;

      const newBrand: Brand = {
        id: data.id,
        name: data.name,
        domain: data.domain,
        websiteUrl: data.website_url || undefined,
        darkLogoUrl: data.dark_logo_url || undefined,
        darkLogoPublicId: data.dark_logo_public_id || undefined,
        lightLogoUrl: data.light_logo_url || undefined,
        lightLogoPublicId: data.light_logo_public_id || undefined,
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        accentColor: data.accent_color || undefined,
        socialLinks: Array.isArray(data.social_links) ? data.social_links as any : [],
        allLinks: Array.isArray(data.all_links) ? data.all_links as any : [],
        footerConfigured: data.footer_configured || false,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      toast.success('Brand saved!');
      onComplete(newBrand);
    } catch (error) {
      console.error('Failed to save brand:', error);
      toast.error('Failed to save brand');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = brandName && darkLogoUrl && lightLogoUrl;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up New Brand</DialogTitle>
          <DialogDescription>
            {websiteUrl}
          </DialogDescription>
        </DialogHeader>

        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing brand...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Brand Name */}
            <div className="space-y-2">
              <Label htmlFor="brand-name">Brand Name</Label>
              <Input
                id="brand-name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Enter brand name"
              />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1 font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Detected Social Links */}
            {socialLinks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm">Detected Social Links</Label>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded hover:bg-muted/80"
                    >
                      {link.platform}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Logo Uploads */}
            <div className="grid grid-cols-2 gap-4">
              <LogoUploadZone
                label="Dark Logo (for light backgrounds)"
                logoUrl={darkLogoUrl}
                isUploading={isUploadingDark}
                onUpload={(file) => uploadLogo(file, 'dark')}
                onRemove={() => setDarkLogoUrl(undefined)}
                bgClass="bg-white"
              />
              <LogoUploadZone
                label="Light Logo (for dark backgrounds)"
                logoUrl={lightLogoUrl}
                isUploading={isUploadingLight}
                onUpload={(file) => uploadLogo(file, 'light')}
                onRemove={() => setLightLogoUrl(undefined)}
                bgClass="bg-zinc-900"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!canSave || isSaving} className="flex-1">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save & Continue
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
