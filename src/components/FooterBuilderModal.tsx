import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, ChevronRight, ChevronLeft, X, AlertCircle, Sparkles, Figma, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { getSocialIconUrl, uploadAllSocialIcons } from '@/lib/socialIcons';
import type { Brand, SocialLink } from '@/types/brand-assets';

interface FooterBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  onFooterSaved: () => void;
  onOpenStudio?: (referenceImageUrl: string, footerHtml: string) => void;
}

type Step = 'reference' | 'logos' | 'social' | 'generate';
type SourceType = 'image' | 'figma' | null;

interface FigmaDesignData {
  design: any;
  imageUrls: Record<string, string>;
  exportedImageUrl: string | null;
}

export function FooterBuilderModal({ open, onOpenChange, brand, onFooterSaved, onOpenStudio }: FooterBuilderModalProps) {
  const [step, setStep] = useState<Step>('reference');
  const [sourceType, setSourceType] = useState<SourceType>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  
  // Figma state
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [figmaData, setFigmaData] = useState<FigmaDesignData | null>(null);
  
  // Logo state
  const [darkLogoUrl, setDarkLogoUrl] = useState(brand.darkLogoUrl || '');
  const [lightLogoUrl, setLightLogoUrl] = useState(brand.lightLogoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState<'dark' | 'light' | null>(null);
  
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(brand.socialLinks || []);
  const [iconColor, setIconColor] = useState('ffffff');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingReference(false);
    }
  }, [brand.domain]);

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
        imageUrls: data.imageUrls || {},
        exportedImageUrl: data.exportedImageUrl,
      });
      setSourceType('figma');
      
      // Use the exported image as reference for the studio
      if (data.exportedImageUrl) {
        setReferenceImageUrl(data.exportedImageUrl);
      }
      
      toast.success('Figma design fetched successfully');
    } catch (error) {
      console.error('Figma fetch error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch Figma design');
    } finally {
      setIsFetchingFigma(false);
    }
  }, [figmaUrl]);

  const handleLogoUpload = useCallback(async (file: File, type: 'dark' | 'light') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploadingLogo(type);
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
          folder: `brands/${brand.domain}/logos`,
          publicId: `${type}-logo`,
        },
      });

      if (error) throw error;

      if (type === 'dark') {
        setDarkLogoUrl(data.url);
      } else {
        setLightLogoUrl(data.url);
      }

      // Save to brand in database
      const updateFields = type === 'dark'
        ? { dark_logo_url: data.url, dark_logo_public_id: data.publicId }
        : { light_logo_url: data.url, light_logo_public_id: data.publicId };

      await supabase
        .from('brands')
        .update(updateFields)
        .eq('id', brand.id);

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded`);
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(null);
    }
  }, [brand.id, brand.domain]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleReferenceUpload(file);
  }, [handleReferenceUpload]);

  const handleGenerateFooter = async () => {
    setIsGenerating(true);
    setGenerationStatus('Uploading social icons to Cloudinary...');
    
    try {
      // Upload all social icons to Cloudinary for reliable email rendering
      const socialIconsData = await uploadAllSocialIcons(
        socialLinks,
        iconColor,
        brand.domain
      );
      
      console.log('Social icons uploaded to Cloudinary:', socialIconsData);

      // If using Figma source, use AI with Figma measurements + brand context
      if (sourceType === 'figma' && figmaData) {
        setGenerationStatus('Analyzing Figma design with AI...');
        
        const { data, error } = await supabase.functions.invoke('figma-to-email-html', {
          body: {
            design: figmaData.design,
            exportedImageUrl: figmaData.exportedImageUrl,
            lightLogoUrl: lightLogoUrl,
            darkLogoUrl: darkLogoUrl,
            socialIcons: socialIconsData,
            brandName: brand.name,
            websiteUrl: brand.websiteUrl || `https://${brand.domain}`,
            allLinks: brand.allLinks || [],
            brandColors: {
              primary: brand.primaryColor,
              secondary: brand.secondaryColor,
              accent: brand.accentColor,
              background: brand.backgroundColor,
              textPrimary: brand.textPrimaryColor,
              link: brand.linkColor,
            },
          }
        });

        if (error) throw error;
        
        if (!data.success || !data.html) {
          throw new Error('Failed to generate HTML from Figma design');
        }

        // Hand off to studio for refinement
        if (onOpenStudio && referenceImageUrl) {
          onOpenChange(false);
          onOpenStudio(referenceImageUrl, data.html);
        } else {
          toast.success('Footer generated from Figma!');
        }
        return;
      }

      // Otherwise use AI vision-based generation
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-footer-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          referenceImageUrl,
          logoUrl: lightLogoUrl,
          lightLogoUrl: lightLogoUrl,
          darkLogoUrl: darkLogoUrl,
          socialIcons: socialIconsData,
          brandName: brand.name,
          websiteUrl: brand.websiteUrl || `https://${brand.domain}`,
          allLinks: brand.allLinks || [],
          brandColors: {
            primary: brand.primaryColor,
            secondary: brand.secondaryColor,
            accent: brand.accentColor,
            background: brand.backgroundColor,
            textPrimary: brand.textPrimaryColor,
            link: brand.linkColor,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalHtml = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.message) {
                    setGenerationStatus(data.message);
                  }

                  if (data.status === 'complete') {
                    finalHtml = data.html;
                  }

                  if (data.status === 'error') {
                    throw new Error(data.error);
                  }
                } catch (parseError) {
                  console.error('SSE parse error:', parseError, 'line:', line.substring(0, 100));
                }
              }
          }
        }
      }

      if (!finalHtml) {
        throw new Error('No HTML received from generator');
      }

      // Hand off to studio for refinement
      if (onOpenStudio && referenceImageUrl) {
        onOpenChange(false);
        onOpenStudio(referenceImageUrl, finalHtml);
      } else {
        toast.success('Footer generated! Opening editor...');
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
              <div className="grid grid-cols-2 gap-4">
                {/* Image upload option */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  {isUploadingReference ? (
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                        <Image className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Upload Image</p>
                        <p className="text-xs text-muted-foreground">Drop or click</p>
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

                {/* Figma link option */}
                <div
                  onClick={() => setSourceType('figma')}
                  className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                      <Figma className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Figma Link</p>
                      <p className="text-xs text-muted-foreground">Paste prototype</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Figma URL input */}
            {sourceType === 'figma' && !figmaData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSourceType(null)}
                    className="h-8 px-2"
                  >
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
                <p className="text-xs text-muted-foreground">
                  Copy the link to a specific frame or component in Figma
                </p>
                <Button 
                  onClick={handleFetchFigma} 
                  disabled={isFetchingFigma || !figmaUrl.trim()}
                  className="w-full"
                >
                  {isFetchingFigma ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Figma className="w-4 h-4 mr-2" />
                      Fetch Design
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Show fetched Figma preview */}
            {sourceType === 'figma' && figmaData && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Figma className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Figma design loaded</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFigmaData(null);
                      setSourceType(null);
                      setFigmaUrl('');
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {figmaData.exportedImageUrl && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <img 
                      src={figmaData.exportedImageUrl} 
                      alt="Figma design preview" 
                      className="w-full"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  {figmaData.design?.name || 'Design ready for conversion'}
                </p>
              </div>
            )}

            {/* Show uploaded image preview */}
            {sourceType === 'image' && referenceImageUrl && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Image uploaded</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReferenceImageUrl(null);
                      setSourceType(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <img 
                    src={referenceImageUrl} 
                    alt="Reference" 
                    className="w-full max-h-48 object-contain"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Click next to continue
                </p>
              </div>
            )}

            <Button 
              variant="link" 
              className="w-full text-muted-foreground"
              onClick={() => setStep('logos')}
            >
              Skip - I don't have a reference
            </Button>
          </div>
        );

      case 'logos':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-2">
              <h3 className="font-medium">Upload your logos</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload both versions of your logo for use in emails.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Dark Logo */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Dark Logo (for light backgrounds)</Label>
                {darkLogoUrl ? (
                  <div className="relative group rounded-lg border border-border/50 bg-white p-4 h-28 flex items-center justify-center">
                    <img 
                      src={darkLogoUrl} 
                      alt="Dark logo" 
                      className="max-h-16 max-w-full object-contain"
                    />
                    <button
                      onClick={() => setDarkLogoUrl('')}
                      className="absolute top-2 right-2 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed border-border/50 cursor-pointer hover:bg-muted/20 transition-colors bg-white">
                    {uploadingLogo === 'dark' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Drop or click</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, 'dark');
                        e.target.value = '';
                      }}
                      disabled={uploadingLogo !== null}
                    />
                  </label>
                )}
              </div>

              {/* Light Logo */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Light Logo (for dark backgrounds)</Label>
                {lightLogoUrl ? (
                  <div className="relative group rounded-lg border border-border/50 bg-zinc-900 p-4 h-28 flex items-center justify-center">
                    <img 
                      src={lightLogoUrl} 
                      alt="Light logo" 
                      className="max-h-16 max-w-full object-contain"
                    />
                    <button
                      onClick={() => setLightLogoUrl('')}
                      className="absolute top-2 right-2 p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed border-border/50 cursor-pointer hover:bg-muted/20 transition-colors bg-zinc-900/50">
                    {uploadingLogo === 'light' ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Drop or click</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, 'light');
                        e.target.value = '';
                      }}
                      disabled={uploadingLogo !== null}
                    />
                  </label>
                )}
              </div>
            </div>

            {!lightLogoUrl && !darkLogoUrl ? (
              <p className="text-xs text-amber-500 text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Upload at least one logo to continue
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                The light logo will be used in your email footer (dark background)
              </p>
            )}
          </div>
        );

      case 'social':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Social links & icons</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Icons are automatically sourced from Simple Icons. Just confirm your links.
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
                    {sourceType === 'figma'
                      ? 'Converting Figma design to email-safe HTML'
                      : referenceImageUrl 
                        ? 'AI is analyzing your reference and creating matching HTML'
                        : 'AI is creating HTML based on your preferences'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-12 h-12 mx-auto text-primary" />
                <div>
                  <h3 className="font-medium">Ready to generate</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {sourceType === 'figma'
                      ? 'Your Figma design will be converted to email-safe HTML'
                      : 'Click below to generate your footer HTML. You\'ll be able to refine it in the studio.'}
                  </p>
                </div>
                <Button onClick={handleGenerateFooter} size="lg">
                  {sourceType === 'figma' ? (
                    <>
                      <Figma className="w-4 h-4 mr-2" />
                      Convert from Figma
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate Footer
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        );
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'reference': return sourceType !== null || true; // Can always skip
      case 'logos': return !!lightLogoUrl || !!darkLogoUrl;
      case 'social': return true;
      case 'generate': return false;
    }
  };

  const getNextStep = (): Step | null => {
    switch (step) {
      case 'reference': return 'logos';
      case 'logos': return 'social';
      case 'social': return 'generate';
      case 'generate': return null;
    }
  };

  const getPrevStep = (): Step | null => {
    switch (step) {
      case 'reference': return null;
      case 'logos': return 'reference';
      case 'social': return 'logos';
      case 'generate': return 'social';
    }
  };

  const stepLabels: Record<Step, string> = {
    reference: 'Reference',
    logos: 'Logos',
    social: 'Social Links',
    generate: 'Generate',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Up Footer for {brand.name}</DialogTitle>
          <DialogDescription>
            Create a branded email footer that will be included in all your campaigns.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 py-2">
          {(['reference', 'logos', 'social', 'generate'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div 
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step ? 'bg-primary' : 
                  (['reference', 'logos', 'social', 'generate'].indexOf(s) < ['reference', 'logos', 'social', 'generate'].indexOf(step)) 
                    ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
              {i < 3 && <div className="w-6 h-px bg-border mx-1" />}
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
              ) : sourceType === 'figma' ? (
                <Figma className="w-4 h-4 mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {sourceType === 'figma' ? 'Convert' : 'Generate'}
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
  );
}
