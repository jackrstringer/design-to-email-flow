import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, ChevronRight, ChevronLeft, Image as ImageIcon, Link2, Sparkles, Save, RefreshCw, Check, Copy, X, AlertCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SocialLinksEditor } from './SocialLinksEditor';
import { RefinementChat, ChatMessage } from './RefinementChat';
import { HtmlPreviewFrame } from './HtmlPreviewFrame';
import { getSocialIconUrl } from '@/lib/socialIcons';
import type { Brand, SocialLink } from '@/types/brand-assets';

interface FooterBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  onFooterSaved: () => void;
}

type Step = 'reference' | 'logos' | 'social' | 'generate' | 'refine';

export function FooterBuilderModal({ open, onOpenChange, brand, onFooterSaved }: FooterBuilderModalProps) {
  const [step, setStep] = useState<Step>('reference');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  
  // Logo state - track both dark and light logos
  const [darkLogoUrl, setDarkLogoUrl] = useState(brand.darkLogoUrl || '');
  const [lightLogoUrl, setLightLogoUrl] = useState(brand.lightLogoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState<'dark' | 'light' | null>(null);
  
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(brand.socialLinks || []);
  const [iconColor, setIconColor] = useState('ffffff');
  const [footerName, setFooterName] = useState('Standard Footer');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  
  // Refinement state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsUploadingReference(true);
    try {
      // Convert to base64 and upload to Cloudinary
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

      // Update local state
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
    setGenerationStatus(referenceImageUrl ? 'Generating footer...' : 'Generating footer...');
    
    try {
      // Build social icons data with Simple Icons URLs
      const socialIconsData = socialLinks.map(link => ({
        platform: link.platform,
        url: link.url,
        iconUrl: getSocialIconUrl(link.platform, iconColor),
      }));

      // Show initial status
      setGenerationStatus('Generating initial footer design...');

      const { data, error } = await supabase.functions.invoke('generate-footer-html', {
        body: {
          referenceImageUrl,
          logoUrl: lightLogoUrl, // Use light logo for dark footer backgrounds
          socialIcons: socialIconsData,
          brandName: brand.name,
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
      
      // Show refinement results
      const { iterations = 0, matchAchieved = false } = data;
      
      setGeneratedHtml(data.html);
      setStep('refine');
      
      if (matchAchieved) {
        toast.success(`Footer generated! Achieved pixel-perfect match after ${iterations} refinement${iterations === 1 ? '' : 's'}.`);
      } else if (iterations > 0) {
        toast.success(`Footer generated after ${iterations} refinement${iterations === 1 ? '' : 's'}. You can further refine via chat.`);
      } else {
        toast.success('Footer generated! Use chat to refine further.');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate footer');
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const handleRefine = async (message: string) => {
    if (!generatedHtml) return;
    
    const userMessage: ChatMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsRefining(true);

    try {
      // Use the dedicated footer refinement function
      const { data, error } = await supabase.functions.invoke('refine-footer-html', {
        body: {
          currentHtml: generatedHtml,
          userRequest: message,
          referenceImageUrl, // Pass reference image for comparison
          logoUrl: lightLogoUrl, // Pass logo URL to enforce logo image usage
          brandContext: {
            name: brand.name,
            domain: brand.domain,
            websiteUrl: brand.websiteUrl,
            colors: {
              primary: brand.primaryColor,
              secondary: brand.secondaryColor,
              accent: brand.accentColor,
              background: brand.backgroundColor,
              textPrimary: brand.textPrimaryColor,
              link: brand.linkColor,
            }
          },
        }
      });

      if (error) throw error;

      const refinedHtml = data?.refinedHtml;
      console.log('Refinement response:', { hasRefinedHtml: !!refinedHtml, htmlLength: refinedHtml?.length });
      
      if (refinedHtml && refinedHtml.trim()) {
        console.log('Setting new generated HTML, first 100 chars:', refinedHtml.substring(0, 100));
        setGeneratedHtml(refinedHtml);
        
        const assistantMessage: ChatMessage = { 
          role: 'assistant', 
          content: 'I\'ve updated the footer based on your request. Check the preview to see the changes.' 
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        console.error('No refined HTML in response:', data);
        const errorMessage: ChatMessage = { 
          role: 'assistant', 
          content: 'Sorry, I couldn\'t generate the updated HTML. Please try again.' 
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Refinement error:', error);
      toast.error('Failed to refine footer');
      
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveFooter = async () => {
    if (!generatedHtml) return;
    
    setIsSaving(true);
    try {
      // Save to brand_footers table
      const { error } = await supabase
        .from('brand_footers')
        .insert({
          brand_id: brand.id,
          name: footerName,
          html: generatedHtml,
          logo_url: lightLogoUrl || null,
          is_primary: true,
        });

      if (error) throw error;

      // Update brand.footer_configured
      await supabase
        .from('brands')
        .update({ footer_configured: true })
        .eq('id', brand.id);

      toast.success('Footer saved successfully!');
      onFooterSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save footer');
    } finally {
      setIsSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'reference':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Upload a reference image</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Upload a screenshot of your existing email footer so we can match the layout and style.
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/60 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              {isUploadingReference ? (
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
              ) : referenceImageUrl ? (
                <div className="space-y-3">
                  <img 
                    src={referenceImageUrl} 
                    alt="Reference" 
                    className="max-h-48 mx-auto rounded-md"
                  />
                  <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or click to upload
                  </p>
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

            <Button 
              variant="link" 
              className="w-full text-muted-foreground"
              onClick={() => setStep('logos')}
            >
              Skip - I don't have a reference image
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
                    {referenceImageUrl 
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
                    {referenceImageUrl 
                      ? 'AI will analyze your reference image and auto-refine to match it.'
                      : 'Click below to generate your footer HTML. You can refine it in the next step.'}
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

      case 'refine':
        return (
          <div className="space-y-4">
            {/* Footer name input */}
            <div className="flex items-center gap-3">
              <Label className="text-sm flex-shrink-0">Footer Name</Label>
              <Input
                value={footerName}
                onChange={(e) => setFooterName(e.target.value)}
                placeholder="Standard Footer"
                className="flex-1"
              />
            </div>

            {/* Preview */}
            <div className="border rounded-lg overflow-hidden bg-neutral-900">
              <div className="text-xs text-muted-foreground px-3 py-1.5 border-b bg-muted/30">
                Live Preview (600px email width)
              </div>
              <div className="flex justify-center py-4 bg-neutral-950">
                {generatedHtml && (
                  <div style={{ width: '600px' }}>
                    <HtmlPreviewFrame 
                      html={generatedHtml} 
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Chat refinement */}
            <div className="border rounded-lg">
              <div className="text-xs text-muted-foreground px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2">
                <RefreshCw className="w-3 h-3" />
                Refine with AI
              </div>
              <RefinementChat
                messages={messages}
                onSendMessage={handleRefine}
                isLoading={isRefining}
                className="max-h-48"
              />
            </div>
          </div>
        );
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'reference': return true; // Optional
      case 'logos': return !!lightLogoUrl || !!darkLogoUrl; // At least one logo required
      case 'social': return true;
      case 'generate': return false;
      case 'refine': return !!generatedHtml;
    }
  };

  const getNextStep = (): Step | null => {
    switch (step) {
      case 'reference': return 'logos';
      case 'logos': return 'social';
      case 'social': return 'generate';
      case 'generate': return null;
      case 'refine': return null;
    }
  };

  const getPrevStep = (): Step | null => {
    switch (step) {
      case 'reference': return null;
      case 'logos': return 'reference';
      case 'social': return 'logos';
      case 'generate': return 'social';
      case 'refine': return 'social';
    }
  };

  const stepLabels: Record<Step, string> = {
    reference: 'Reference',
    logos: 'Logos',
    social: 'Social Links',
    generate: 'Generate',
    refine: 'Refine & Save',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[90vh] overflow-hidden flex flex-col",
        step === 'refine' ? "sm:max-w-3xl" : "sm:max-w-lg"
      )}>
        <DialogHeader>
          <DialogTitle>Set Up Footer for {brand.name}</DialogTitle>
          <DialogDescription>
            Create a branded email footer that will be included in all your campaigns.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 py-2">
          {(['reference', 'logos', 'social', 'generate', 'refine'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div 
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step ? 'bg-primary' : 
                  (['reference', 'logos', 'social', 'generate', 'refine'].indexOf(s) < ['reference', 'logos', 'social', 'generate', 'refine'].indexOf(step)) 
                    ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
              {i < 4 && <div className="w-6 h-px bg-border mx-1" />}
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

          {step === 'refine' ? (
            <Button onClick={handleSaveFooter} disabled={isSaving || !generatedHtml}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Footer
            </Button>
          ) : step === 'generate' ? (
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
  );
}
