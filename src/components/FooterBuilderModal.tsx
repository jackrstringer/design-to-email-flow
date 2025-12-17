import { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, ChevronRight, ChevronLeft, Image as ImageIcon, Link2, Sparkles, Save, RefreshCw } from 'lucide-react';
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

type Step = 'reference' | 'logo' | 'social' | 'generate' | 'refine';

export function FooterBuilderModal({ open, onOpenChange, brand, onFooterSaved }: FooterBuilderModalProps) {
  const [step, setStep] = useState<Step>('reference');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [logoUrl, setLogoUrl] = useState(brand.lightLogoUrl || '');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(brand.socialLinks || []);
  const [iconColor, setIconColor] = useState('ffffff');
  const [footerName, setFooterName] = useState('Standard Footer');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleReferenceUpload(file);
  }, [handleReferenceUpload]);

  const handleGenerateFooter = async () => {
    setIsGenerating(true);
    try {
      // Build social icons data with Simple Icons URLs
      const socialIconsData = socialLinks.map(link => ({
        platform: link.platform,
        url: link.url,
        iconUrl: getSocialIconUrl(link.platform, iconColor),
      }));

      const { data, error } = await supabase.functions.invoke('generate-footer-html', {
        body: {
          referenceImageUrl,
          logoUrl,
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
      
      setGeneratedHtml(data.html);
      setStep('refine');
      toast.success('Footer generated!');
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate footer');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (message: string) => {
    if (!generatedHtml) return;
    
    const userMessage: ChatMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setIsRefining(true);

    try {
      const { data, error } = await supabase.functions.invoke('refine-campaign', {
        body: {
          currentHtml: generatedHtml,
          userRequest: message,
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

      const refinedHtml = data.refinedHtml || data.html;
      setGeneratedHtml(refinedHtml);
      
      const assistantMessage: ChatMessage = { 
        role: 'assistant', 
        content: 'I\'ve updated the footer based on your request. Check the preview to see the changes.' 
      };
      setMessages(prev => [...prev, assistantMessage]);
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
          logo_url: logoUrl || null,
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
              onClick={() => setStep('logo')}
            >
              Skip - I don't have a reference image
            </Button>
          </div>
        );

      case 'logo':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2 py-4">
              <h3 className="font-medium">Confirm your logo</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                We'll use this logo in your footer. For dark backgrounds, use a white/light version.
              </p>
            </div>

            {logoUrl ? (
              <div className="bg-zinc-900 rounded-lg p-8 flex items-center justify-center">
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="max-h-16 max-w-[200px] object-contain"
                />
              </div>
            ) : (
              <div className="bg-muted rounded-lg p-8 text-center">
                <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No logo uploaded</p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm">Logo URL</Label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Or upload a new logo in Brand Settings
              </p>
            </div>
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
                  <h3 className="font-medium">Generating your footer...</h3>
                  <p className="text-sm text-muted-foreground">
                    AI is creating HTML based on your preferences
                  </p>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="w-12 h-12 mx-auto text-primary" />
                <div>
                  <h3 className="font-medium">Ready to generate</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Click below to generate your footer HTML. You can refine it in the next step.
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
            <div className="border rounded-lg overflow-hidden bg-white">
              <div className="text-xs text-muted-foreground px-3 py-1.5 border-b bg-muted/30">
                Live Preview
              </div>
            <div className="h-64 overflow-auto">
                {generatedHtml && (
                  <HtmlPreviewFrame 
                    html={generatedHtml} 
                    className="w-full h-full"
                  />
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
      case 'logo': return true; // Optional
      case 'social': return true;
      case 'generate': return false;
      case 'refine': return !!generatedHtml;
    }
  };

  const getNextStep = (): Step | null => {
    switch (step) {
      case 'reference': return 'logo';
      case 'logo': return 'social';
      case 'social': return 'generate';
      case 'generate': return null;
      case 'refine': return null;
    }
  };

  const getPrevStep = (): Step | null => {
    switch (step) {
      case 'reference': return null;
      case 'logo': return 'reference';
      case 'social': return 'logo';
      case 'generate': return 'social';
      case 'refine': return 'social';
    }
  };

  const stepLabels: Record<Step, string> = {
    reference: 'Reference',
    logo: 'Logo',
    social: 'Social Links',
    generate: 'Generate',
    refine: 'Refine & Save',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Up Footer for {brand.name}</DialogTitle>
          <DialogDescription>
            Create a branded email footer that will be included in all your campaigns.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 py-2">
          {(['reference', 'logo', 'social', 'generate', 'refine'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div 
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step ? 'bg-primary' : 
                  (['reference', 'logo', 'social', 'generate', 'refine'].indexOf(s) < ['reference', 'logo', 'social', 'generate', 'refine'].indexOf(step)) 
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
