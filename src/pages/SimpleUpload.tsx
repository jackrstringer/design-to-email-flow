import { useState, useCallback } from 'react';
import { Upload, Key, CheckCircle, Loader2, ExternalLink, FileText, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ENHANCED_FOOTER_HTML = `<!-- Black Footer Section -->
<tr>
    <td align="center" class="darkmode" style="padding: 60px 5% 50px 5%; background-color: #111111;">
        <a href="https://www.enhanced.com/products" style="text-decoration: none;">
            <img src="https://tellescope-public-files.s3.amazonaws.com/prod/68430fb605def07f844d4d25/rDUn8nIA-Q3HREpjBcEiSXea_60YOsrWyLH6O97ZdgU.?version=0" alt="Enhanced" style="display: block; border: 0; margin: 0 auto; width: 100%; max-width: 380px; height: auto;" />
        </a>
    </td>
</tr>

<!-- Footer Navigation Grid -->
<tr>
    <td align="center" class="darkmode" style="padding: 0 5% 50px 5%; background-color: #111111;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px;">
            <tr>
                <td align="center" width="50%" style="border-right: 1px solid #ffffff; padding: 20px 10px;">
                    <a href="https://www.enhanced.com/games" class="darkmode-text" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; color: #ffffff; text-decoration: none; font-weight: 400; display: block;">Games</a>
                </td>
                <td align="center" width="50%" style="padding: 20px 10px;">
                    <a href="https://www.enhanced.com/athletes" class="darkmode-text" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; color: #ffffff; text-decoration: none; font-weight: 400; display: block;">Athletes</a>
                </td>
            </tr>
            <tr>
                <td align="center" width="50%" style="border-right: 1px solid #ffffff; border-top: 1px solid #ffffff; padding: 20px 10px;">
                    <a href="https://www.enhanced.com/products" class="darkmode-text" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; color: #ffffff; text-decoration: none; font-weight: 400; display: block;">Products</a>
                </td>
                <td align="center" width="50%" style="border-top: 1px solid #ffffff; padding: 20px 10px;">
                    <a href="https://www.enhanced.com/company" class="darkmode-text" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 18px; color: #ffffff; text-decoration: none; font-weight: 400; display: block;">About</a>
                </td>
            </tr>
        </table>
    </td>
</tr>

<!-- Social Icons -->
<tr>
    <td align="center" class="darkmode" style="padding: 0 5% 50px 5%; background-color: #111111;">
        <table border="0" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 0 15px;">
                    <a href="https://www.instagram.com/enhanced_games" style="text-decoration: none;">
                        <img src="https://tellescope-public-files.s3.amazonaws.com/prod/68430fb605def07f844d4d25/eszASf0EhsU8PeyF96_CaStHNO2MrHFB6uDt23HJXus.?version=0" alt="Instagram" width="32" height="32" style="display: block; border: 0;" />
                    </a>
                </td>
                <td style="padding: 0 15px;">
                    <a href="https://x.com/enhanced_games" style="text-decoration: none;">
                        <img src="https://tellescope-public-files.s3.amazonaws.com/prod/68430fb605def07f844d4d25/uAuy6tvHgNCPxZE11k-iicgXiw-P3p7Jacko8xpi-L8.?version=0" alt="X" width="32" height="32" style="display: block; border: 0;" />
                    </a>
                </td>
                <td style="padding: 0 15px;">
                    <a href="https://www.tiktok.com/@enhanced_games" style="text-decoration: none;">
                        <img src="https://tellescope-public-files.s3.amazonaws.com/prod/68430fb605def07f844d4d25/FKYqxcI8lR8HQQH-C7P-X8R_PNiZkfWQ-H1fsUNOwXs.?version=0" alt="TikTok" width="32" height="32" style="display: block; border: 0;" />
                    </a>
                </td>
            </tr>
        </table>
    </td>
</tr>

<!-- Legal Text -->
<tr>
    <td class="darkmode" style="padding: 0 5% 50px 5%; background-color: #111111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 10px; line-height: 15px; color: #888888; text-align: center;">
        "Enhanced:" and "Enhanced Games" are registered trademarks of Enhanced Ltd. All rights reserved. There cannot be any confusion; the Enhanced Games are separate and independent from the Olympics, the IOC and the USOPC. The Enhanced Games are founded on very different ideas about financial fairness and a level playing field in elite sport.
    </td>
</tr>`;

const DEFAULT_LIST_ID = 'QRLACj';

type CreationMode = 'template' | 'campaign';

export default function SimpleUpload() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('klaviyo_api_key') || '');
  const [includeFooter, setIncludeFooter] = useState(() => localStorage.getItem('include_footer') !== 'false');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<CreationMode>('campaign');

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('klaviyo_api_key', key);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g)$/)) {
      toast.error('Please upload a PNG or JPG file');
      return;
    }

    if (!apiKey.trim()) {
      toast.error('Please enter your Klaviyo API key first');
      return;
    }

    setIsUploading(true);
    setStatus('Reading file...');
    setTemplateId(null);
    setCampaignId(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to Cloudinary
      setStatus('Uploading image to Cloudinary...');
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageData: dataUrl, folder: 'klaviyo-templates' }
      });

      if (uploadError || !uploadData?.url) {
        throw new Error(uploadError?.message || 'Failed to upload image');
      }

      // Push to Klaviyo
      const templateName = file.name.replace(/\.(png|jpe?g)$/i, '') || 'Email Template';
      
      if (creationMode === 'campaign') {
        setStatus('Creating Klaviyo template & campaign...');
      } else {
        setStatus('Creating Klaviyo template...');
      }
      
      const { data: klaviyoData, error: klaviyoError } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          imageUrl: uploadData.url,
          templateName,
          klaviyoApiKey: apiKey.trim(),
          footerHtml: includeFooter ? ENHANCED_FOOTER_HTML : null,
          mode: creationMode,
          listId: creationMode === 'campaign' ? DEFAULT_LIST_ID : undefined
        }
      });

      if (klaviyoError || !klaviyoData?.templateId) {
        throw new Error(klaviyoData?.error || klaviyoError?.message || 'Failed to create Klaviyo template');
      }

      setTemplateId(klaviyoData.templateId);
      
      // Check for partial success (template created but campaign failed)
      if (creationMode === 'campaign' && klaviyoData.error) {
        // Campaign failed but template was created
        toast.error(klaviyoData.error);
        setStatus('Template created (campaign failed)');
      } else if (creationMode === 'campaign' && klaviyoData.campaignId) {
        setCampaignId(klaviyoData.campaignId);
        setStatus('Campaign created successfully!');
        toast.success('Template & campaign created in Klaviyo!');
      } else {
        setStatus('Template created successfully!');
        toast.success('Template pushed to Klaviyo!');
      }

    } catch (error) {
      console.error('Upload error:', error);
      setStatus('');
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [apiKey, creationMode, includeFooter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const resetUpload = () => {
    setTemplateId(null);
    setCampaignId(null);
    setStatus('');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">PNG → Klaviyo</h1>
          <p className="text-muted-foreground mt-2">Upload a PNG or JPG and push it directly to Klaviyo as an editable template</p>
        </div>

        {/* API Key Section */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Key className="w-4 h-4" />
            Klaviyo Private API Key
          </label>
          <Input
            type="password"
            placeholder="pk_xxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Your key is saved locally and never stored on our servers
          </p>
        </div>

        {/* Footer Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
          <div className="space-y-0.5">
            <Label htmlFor="footer-toggle" className="text-sm font-medium">Include Footer</Label>
            <p className="text-xs text-muted-foreground">
              Add the Enhanced footer to exported templates
            </p>
          </div>
          <Switch
            id="footer-toggle"
            checked={includeFooter}
            onCheckedChange={(checked) => {
              setIncludeFooter(checked);
              localStorage.setItem('include_footer', String(checked));
            }}
          />
        </div>

        {/* Creation Mode Selection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setCreationMode('template')}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
              creationMode === 'template'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            )}
          >
            <FileText className={cn(
              'w-6 h-6',
              creationMode === 'template' ? 'text-primary' : 'text-muted-foreground'
            )} />
            <span className={cn(
              'text-sm font-medium',
              creationMode === 'template' ? 'text-foreground' : 'text-muted-foreground'
            )}>
              Standalone Template
            </span>
            <span className="text-xs text-muted-foreground text-center">
              Create template only
            </span>
          </button>
          
          <button
            onClick={() => setCreationMode('campaign')}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
              creationMode === 'campaign'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground/50'
            )}
          >
            <Rocket className={cn(
              'w-6 h-6',
              creationMode === 'campaign' ? 'text-primary' : 'text-muted-foreground'
            )} />
            <span className={cn(
              'text-sm font-medium',
              creationMode === 'campaign' ? 'text-foreground' : 'text-muted-foreground'
            )}>
              New Campaign
            </span>
            <span className="text-xs text-muted-foreground text-center">
              Go straight to editor
            </span>
          </button>
        </div>

        {/* Drop Zone */}
        {!templateId && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              'relative flex flex-col items-center justify-center',
              'h-64 border-2 border-dashed rounded-xl transition-all duration-200',
              'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
              isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border',
              isUploading && 'pointer-events-none opacity-60'
            )}
          >
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              {isUploading ? (
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              ) : (
                <div className={cn(
                  'p-4 rounded-full transition-colors',
                  isDragActive ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <Upload className={cn(
                    'w-8 h-8 transition-colors',
                    isDragActive ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </div>
              )}
              
              <div>
                <p className="text-lg font-medium text-foreground">
                  {isUploading ? status : 'Drop your PNG here'}
                </p>
                {!isUploading && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    or click to browse
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success State - Campaign Mode */}
        {templateId && campaignId && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Campaign created successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your template has been created and added to a new campaign. Click below to open the drag-and-drop editor.
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => window.open(`https://www.klaviyo.com/campaign/${campaignId}/edit/content`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Campaign Editor
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={resetUpload}
            >
              Upload another
            </Button>
          </div>
        )}

        {/* Success State - Template Mode */}
        {templateId && !campaignId && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Template created successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Important:</strong> To edit this template with drag-and-drop, you must use it in a <strong>Campaign</strong> or <strong>Flow</strong>. 
              Opening it directly from Templates will show the code editor.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(`https://www.klaviyo.com/email-templates/${templateId}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Template
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={() => window.open('https://www.klaviyo.com/campaigns/create', '_blank')}
              >
                Create Campaign
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={resetUpload}
            >
              Upload another
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
