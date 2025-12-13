import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, Loader2, Check } from 'lucide-react';
import { BrandAssets, SOCIAL_PLATFORMS, SocialLink } from '@/types/brand-assets';

interface BrandAssetsSetupProps {
  assets: BrandAssets;
  isUploading: boolean;
  onUploadLogo: (file: File) => void;
  onRemoveLogo: () => void;
  onUpdateSocialLinks: (links: SocialLink[]) => void;
  onUpdateColors: (primary: string, secondary: string) => void;
  onComplete: () => void;
}

export function BrandAssetsSetup({
  assets,
  isUploading,
  onUploadLogo,
  onRemoveLogo,
  onUpdateSocialLinks,
  onUpdateColors,
  onComplete,
}: BrandAssetsSetupProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [socialUrls, setSocialUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    assets.socialLinks.forEach(link => {
      initial[link.platform] = link.url;
    });
    return initial;
  });
  const [primaryColor, setPrimaryColor] = useState(assets.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(assets.secondaryColor);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/png')) {
      onUploadLogo(file);
    }
  };

  const handleSocialChange = (platform: string, url: string) => {
    setSocialUrls(prev => ({ ...prev, [platform]: url }));
  };

  const handleComplete = () => {
    const links: SocialLink[] = Object.entries(socialUrls)
      .filter(([_, url]) => url.trim())
      .map(([platform, url]) => ({
        platform: platform as SocialLink['platform'],
        url: url.trim()
      }));
    
    onUpdateSocialLinks(links);
    onUpdateColors(primaryColor, secondaryColor);
    onComplete();
  };

  const canComplete = assets.logo;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Brand Assets Setup</h1>
          <p className="text-muted-foreground">
            Upload your brand assets to use across all email campaigns
          </p>
        </div>

        {/* Logo Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Company Logo</CardTitle>
            <CardDescription>Upload your logo as a PNG file with transparency</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {assets.logo ? (
              <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg">
                <img 
                  src={assets.logo.url} 
                  alt="Company logo" 
                  className="h-16 w-auto max-w-[200px] object-contain"
                />
                <div className="flex-1">
                  <p className="text-sm text-foreground font-medium">Logo uploaded</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {assets.logo.publicId}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={onRemoveLogo}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full border-2 border-dashed border-border rounded-lg p-8 hover:border-primary/50 hover:bg-secondary/30 transition-colors flex flex-col items-center gap-3 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload PNG logo</span>
                  </>
                )}
              </button>
            )}
          </CardContent>
        </Card>

        {/* Social Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Social Media Links</CardTitle>
            <CardDescription>Add your social profile URLs (optional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {SOCIAL_PLATFORMS.map(platform => (
              <div key={platform.id} className="space-y-1.5">
                <Label htmlFor={platform.id} className="text-sm text-muted-foreground">
                  {platform.label}
                </Label>
                <Input
                  id={platform.id}
                  type="url"
                  placeholder={platform.placeholder}
                  value={socialUrls[platform.id] || ''}
                  onChange={e => handleSocialChange(platform.id, e.target.value)}
                  className="bg-background"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Brand Colors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Brand Colors</CardTitle>
            <CardDescription>Set your primary and secondary brand colors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="primary-color" className="text-sm text-muted-foreground">
                  Primary Color
                </Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="primary-color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="bg-background font-mono text-sm"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondary-color" className="text-sm text-muted-foreground">
                  Secondary Color
                </Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="secondary-color"
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className="w-12 h-10 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className="bg-background font-mono text-sm"
                    placeholder="#64748b"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Complete Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleComplete}
            disabled={!canComplete}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Complete Setup
          </Button>
        </div>
      </div>
    </div>
  );
}
