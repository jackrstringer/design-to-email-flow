import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandAssets, SocialLink, SOCIAL_PLATFORMS } from '@/types/brand-assets';
import { Upload, X, Globe, Search, Loader2, Plus, Trash2 } from 'lucide-react';

interface BrandAssetsSetupProps {
  assets: BrandAssets;
  isUploading: boolean;
  isAnalyzing: boolean;
  onAnalyzeBrand: (url: string) => Promise<any>;
  onUploadLogo: (file: File, type: 'dark' | 'light') => Promise<void>;
  onRemoveLogo: (type: 'dark' | 'light') => void;
  onUpdateSocialLinks: (links: SocialLink[]) => void;
  onUpdateColors: (primary: string, secondary: string, accent?: string) => void;
  onComplete: () => void;
}

export function BrandAssetsSetup({
  assets,
  isUploading,
  isAnalyzing,
  onAnalyzeBrand,
  onUploadLogo,
  onRemoveLogo,
  onUpdateSocialLinks,
  onUpdateColors,
  onComplete,
}: BrandAssetsSetupProps) {
  const [websiteUrl, setWebsiteUrl] = useState(assets.websiteUrl || '');
  const [socialUrls, setSocialUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    assets.socialLinks.forEach(link => {
      initial[link.platform] = link.url;
    });
    return initial;
  });
  const [primaryColor, setPrimaryColor] = useState(assets.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(assets.secondaryColor);
  const [accentColor, setAccentColor] = useState(assets.accentColor || '');
  const [visiblePlatforms, setVisiblePlatforms] = useState<string[]>(() => {
    return assets.socialLinks.map(link => link.platform);
  });

  const handleAnalyze = async () => {
    if (!websiteUrl.trim()) return;
    
    const result = await onAnalyzeBrand(websiteUrl);
    if (result) {
      if (result.colors) {
        setPrimaryColor(result.colors.primary);
        setSecondaryColor(result.colors.secondary);
        if (result.colors.accent) setAccentColor(result.colors.accent);
      }
      if (result.socialLinks?.length > 0) {
        const newSocialUrls: Record<string, string> = {};
        const newPlatforms: string[] = [];
        result.socialLinks.forEach((link: SocialLink) => {
          newSocialUrls[link.platform] = link.url;
          newPlatforms.push(link.platform);
        });
        setSocialUrls(newSocialUrls);
        setVisiblePlatforms(newPlatforms);
      }
    }
  };

  const handleFileSelect = (type: 'dark' | 'light') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'image/png') {
      onUploadLogo(file, type);
    }
  };

  const handleSocialChange = (platform: string, url: string) => {
    const updated = { ...socialUrls, [platform]: url };
    setSocialUrls(updated);
    
    const links: SocialLink[] = Object.entries(updated)
      .filter(([_, url]) => url.trim() !== '')
      .map(([platform, url]) => ({
        platform: platform as SocialLink['platform'],
        url,
      }));
    onUpdateSocialLinks(links);
  };

  const addPlatform = (platformId: string) => {
    if (!visiblePlatforms.includes(platformId)) {
      setVisiblePlatforms([...visiblePlatforms, platformId]);
    }
  };

  const removePlatform = (platformId: string) => {
    setVisiblePlatforms(visiblePlatforms.filter(p => p !== platformId));
    const updated = { ...socialUrls };
    delete updated[platformId];
    setSocialUrls(updated);
    
    const links: SocialLink[] = Object.entries(updated)
      .filter(([_, url]) => url.trim() !== '')
      .map(([platform, url]) => ({
        platform: platform as SocialLink['platform'],
        url,
      }));
    onUpdateSocialLinks(links);
  };

  const handleComplete = () => {
    onUpdateColors(primaryColor, secondaryColor, accentColor || undefined);
    onComplete();
  };

  // Can complete if we have at least one logo (from analysis or manual upload)
  const hasLogo = Boolean(assets.darkLogo || assets.lightLogo);
  const hiddenPlatforms = SOCIAL_PLATFORMS.filter(p => !visiblePlatforms.includes(p.id));

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Brand Assets Setup</h1>
          <p className="text-muted-foreground">
            Configure your brand identity for email campaigns
          </p>
        </div>

        {/* Website Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Brand Discovery
            </CardTitle>
            <CardDescription>
              Enter your website URL to automatically discover brand colors and social links
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://yourcompany.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={isAnalyzing}
              />
              <Button 
                onClick={handleAnalyze} 
                disabled={!websiteUrl.trim() || isAnalyzing}
                className="shrink-0"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Analyze Brand
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logo Upload / Management */}
        {!(assets.darkLogo || assets.lightLogo) ? (
          <Card>
            <CardHeader>
              <CardTitle>Logo Variants</CardTitle>
              <CardDescription>
                Upload logo versions for different email backgrounds (PNG only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Dark Logo (for light backgrounds) */}
                <div className="space-y-2">
                  <Label>Dark Logo (for light backgrounds)</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 bg-white min-h-[120px] flex items-center justify-center">
                    {assets.darkLogo ? (
                      <div className="relative w-full">
                        <img
                          src={assets.darkLogo.url}
                          alt="Dark logo"
                          className="max-h-24 mx-auto object-contain"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
                          onClick={() => onRemoveLogo('dark')}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer">
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Upload dark logo</span>
                        <input
                          type="file"
                          accept="image/png"
                          className="hidden"
                          onChange={handleFileSelect('dark')}
                          disabled={isUploading}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Light Logo (for dark backgrounds) */}
                <div className="space-y-2">
                  <Label>Light Logo (for dark backgrounds)</Label>
                  <div className="border-2 border-dashed rounded-lg p-4 bg-zinc-900 min-h-[120px] flex items-center justify-center">
                    {assets.lightLogo ? (
                      <div className="relative w-full">
                        <img
                          src={assets.lightLogo.url}
                          alt="Light logo"
                          className="max-h-24 mx-auto object-contain"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
                          onClick={() => onRemoveLogo('light')}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer">
                        <Upload className="w-8 h-8 text-zinc-500" />
                        <span className="text-sm text-zinc-500">Upload light logo</span>
                        <input
                          type="file"
                          accept="image/png"
                          className="hidden"
                          onChange={handleFileSelect('light')}
                          disabled={isUploading}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              {isUploading && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Social Links */}
        <Card>
          <CardHeader>
            <CardTitle>Social Media Links</CardTitle>
            <CardDescription>
              {visiblePlatforms.length > 0 
                ? 'Edit discovered links or add more'
                : 'Add your social media profile URLs'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {visiblePlatforms.map((platformId) => {
              const platform = SOCIAL_PLATFORMS.find(p => p.id === platformId);
              if (!platform) return null;
              
              return (
                <div key={platform.id} className="flex items-center gap-2">
                  <Label className="w-24 shrink-0">{platform.label}</Label>
                  <Input
                    type="url"
                    placeholder={platform.placeholder}
                    value={socialUrls[platform.id] || ''}
                    onChange={(e) => handleSocialChange(platform.id, e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePlatform(platform.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
            
            {hiddenPlatforms.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground mr-2">Add:</span>
                {hiddenPlatforms.map((platform) => (
                  <Button
                    key={platform.id}
                    variant="outline"
                    size="sm"
                    onClick={() => addPlatform(platform.id)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {platform.label}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand Colors */}
        <Card>
          <CardHeader>
            <CardTitle>Brand Colors</CardTitle>
            <CardDescription>
              Set your brand's primary and secondary colors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                  />
                  <Input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Secondary Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                  />
                  <Input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#64748b"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accent (optional)</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={accentColor || '#f59e0b'}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                  />
                  <Input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="#f59e0b"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Complete Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleComplete}
          disabled={!hasLogo}
        >
          {hasLogo ? 'Complete Setup' : 'Analyze Website or Upload Logo to Continue'}
        </Button>
      </div>
    </div>
  );
}
