import { useState, useCallback } from 'react';
import { Upload, Key, CheckCircle, Loader2, ExternalLink, FileText, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SliceEditor } from '@/components/SliceEditor';
import { CampaignStudio } from '@/components/CampaignStudio';
import { ProcessingLoader } from '@/components/ProcessingLoader';
import { sliceImage, ImageSlice, resizeImageForAI, ColumnConfig } from '@/lib/imageSlicing';
import type { ProcessedSlice, SliceType } from '@/types/slice';
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

type ViewState = 'upload' | 'slice-editor' | 'slice-results' | 'success';
type CreationMode = 'template' | 'campaign';

export default function SimpleUpload() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('klaviyo_api_key') || '');
  const [includeFooter, setIncludeFooter] = useState(() => localStorage.getItem('include_footer') !== 'false');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  
  // Slice workflow state
  const [viewState, setViewState] = useState<ViewState>('upload');
  const [uploadedImage, setUploadedImage] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [processedSlices, setProcessedSlices] = useState<ProcessedSlice[]>([]);
  const [originalCloudinaryUrl, setOriginalCloudinaryUrl] = useState<string | null>(null);

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

  const handleFileSelect = async (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g)$/)) {
      toast.error('Please upload a PNG or JPG file');
      return;
    }

    if (!apiKey.trim()) {
      toast.error('Please enter your Klaviyo API key first');
      return;
    }

    // Read file and show slice editor
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage({
        dataUrl: reader.result as string,
        fileName: file.name
      });
      setViewState('slice-editor');
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const processSlices = async (slicePositions: number[], _sliceTypes: SliceType[], columnConfigs: ColumnConfig[]) => {
    if (!uploadedImage) return;

    setIsProcessing(true);
    setStatus('Uploading original image...');

    try {
      // Upload original image to ImageKit FIRST for AI reference
      const { data: originalUpload, error: originalError } = await supabase.functions.invoke('upload-to-imagekit', {
        body: { imageData: uploadedImage.dataUrl, folder: 'klaviyo-originals' }
      });

      if (originalError || !originalUpload?.url) {
        throw new Error('Failed to upload original image');
      }
      setOriginalCloudinaryUrl(originalUpload.url);
      console.log('Original image uploaded:', originalUpload.url);

      // Slice the image with column configs
      setStatus('Slicing image...');
      const slices = await sliceImage(uploadedImage.dataUrl, slicePositions, columnConfigs);
      console.log(`Created ${slices.length} slices`);

      // Upload each slice to ImageKit
      setStatus(`Uploading ${slices.length} slices...`);
      const uploadedSlices: { imageUrl: string; slice: ImageSlice }[] = [];

      for (let i = 0; i < slices.length; i++) {
        setStatus(`Uploading slice ${i + 1} of ${slices.length}...`);
        const { data, error } = await supabase.functions.invoke('upload-to-imagekit', {
          body: { imageData: slices[i].dataUrl, folder: 'klaviyo-slices' }
        });

        if (error || !data?.url) {
          throw new Error(`Failed to upload slice ${i + 1}`);
        }

        uploadedSlices.push({ imageUrl: data.url, slice: slices[i] });
      }

      // Resize full campaign image for AI context (max 8000px)
      setStatus('Preparing campaign context...');
      const resizedFullImage = await resizeImageForAI(uploadedImage.dataUrl);
      
      // Analyze slices with AI (with web search grounding)
      setStatus('Analyzing slices with AI...');
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-slices', {
        body: {
          slices: slices.map((s, i) => ({ dataUrl: s.dataUrl, index: i })),
          fullCampaignImage: resizedFullImage, // Send full context for better link intelligence
          brandUrl: 'https://www.enhanced.com',
          brandDomain: 'enhanced.com' // Pass domain for site: search queries
        }
      });

      if (analysisError) {
        console.warn('AI analysis failed, using defaults:', analysisError);
      }

      // Combine uploads with analysis, preserving column metadata
      const analyses = analysisData?.analyses || [];
      const results: ProcessedSlice[] = uploadedSlices.map((uploaded, i) => ({
        imageUrl: uploaded.imageUrl,
        altText: analyses[i]?.altText || `Email section ${i + 1}`,
        link: analyses[i]?.suggestedLink || null,
        isClickable: analyses[i]?.isClickable || false,
        linkVerified: analyses[i]?.linkVerified || false,
        linkWarning: analyses[i]?.linkWarning,
        type: 'image' as SliceType,
        column: uploaded.slice.column,
        totalColumns: uploaded.slice.totalColumns,
        rowIndex: uploaded.slice.rowIndex
      }));

      setProcessedSlices(results);
      setViewState('slice-results');
      setStatus('');

    } catch (error) {
      console.error('Slice processing error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process slices');
      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const createTemplate = async (mode: CreationMode) => {
    if (!uploadedImage || processedSlices.length === 0) return;

    setIsProcessing(true);
    const templateName = uploadedImage.fileName.replace(/\.(png|jpe?g)$/i, '') || 'Email Template';
    
    if (mode === 'campaign') {
      setStatus('Creating Klaviyo template & campaign...');
    } else {
      setStatus('Creating Klaviyo template...');
    }

    try {
      const { data: klaviyoData, error: klaviyoError } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          slices: processedSlices.map(s => ({
            imageUrl: s.imageUrl,
            altText: s.altText,
            link: s.link,
            type: s.type,
            htmlContent: s.htmlContent
          })),
          templateName,
          klaviyoApiKey: apiKey.trim(),
          footerHtml: includeFooter ? ENHANCED_FOOTER_HTML : null,
          mode,
          listId: mode === 'campaign' ? DEFAULT_LIST_ID : undefined
        }
      });

      if (klaviyoError || !klaviyoData?.templateId) {
        throw new Error(klaviyoData?.error || klaviyoError?.message || 'Failed to create Klaviyo template');
      }

      setTemplateId(klaviyoData.templateId);
      
      if (mode === 'campaign' && klaviyoData.error) {
        toast.error(klaviyoData.error);
        setStatus('Template created (campaign failed)');
      } else if (mode === 'campaign' && klaviyoData.campaignId) {
        setCampaignId(klaviyoData.campaignId);
        setStatus('');
        toast.success('Template & campaign created in Klaviyo!');
      } else {
        setStatus('');
        toast.success('Template pushed to Klaviyo!');
      }
      // Don't change viewState - stay in studio to show success inline
      // Success is now shown inline in CampaignStudio

    } catch (error) {
      console.error('Create error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create template');
      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  const convertSliceToHtml = async (index: number) => {
    const slice = processedSlices[index];
    if (!slice || !uploadedImage) return;

    try {
      // We need to get the original slice dataUrl to send to AI
      // Since we already uploaded to Cloudinary, we'll use the hosted image
      const { data, error } = await supabase.functions.invoke('generate-slice-html', {
        body: {
          sliceDataUrl: slice.imageUrl, // Use the Cloudinary URL
          brandUrl: 'https://www.enhanced.com',
          sliceIndex: index,
          totalSlices: processedSlices.length
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate HTML');
      }

      if (data?.htmlContent) {
        const updated = [...processedSlices];
        updated[index] = {
          ...updated[index],
          type: 'html',
          htmlContent: data.htmlContent
        };
        setProcessedSlices(updated);
        toast.success(`Slice ${index + 1} converted to HTML`);
      }
    } catch (err) {
      console.error('HTML conversion error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to convert to HTML');
    }
  };

  const resetUpload = () => {
    setTemplateId(null);
    setCampaignId(null);
    setStatus('');
    setViewState('upload');
    setUploadedImage(null);
    setProcessedSlices([]);
    setOriginalCloudinaryUrl(null);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">PNG → Klaviyo</h1>
          <p className="text-muted-foreground mt-2">
            {viewState === 'upload' && 'Upload a PNG or JPG to slice and push to Klaviyo'}
            {viewState === 'slice-editor' && 'Click to add slice lines, drag to adjust'}
            {viewState === 'slice-results' && 'Review and edit your slices before creating'}
            {viewState === 'success' && 'Your template is ready!'}
          </p>
        </div>

        {/* API Key Section - always visible except on success */}
        {viewState !== 'success' && (
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
          </div>
        )}

        {/* Footer Toggle - only on upload view */}
        {viewState === 'upload' && (
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
        )}

        {/* Upload View */}
        {viewState === 'upload' && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              'relative flex flex-col items-center justify-center',
              'h-64 border-2 border-dashed rounded-xl transition-all duration-200',
              'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
              isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border'
            )}
          >
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <div className={cn(
                'p-4 rounded-full transition-colors',
                isDragActive ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Upload className={cn(
                  'w-8 h-8 transition-colors',
                  isDragActive ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
              
              <div>
                <p className="text-lg font-medium text-foreground">Drop your PNG here</p>
                <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
              </div>
            </div>
          </div>
        )}

        {/* Slice Editor View */}
        {viewState === 'slice-editor' && uploadedImage && (
          <SliceEditor
            imageDataUrl={uploadedImage.dataUrl}
            onProcess={processSlices}
            onCancel={resetUpload}
            isProcessing={isProcessing}
          />
        )}

        {/* Fun processing loader */}
        {isProcessing && status && viewState === 'slice-editor' && (
          <ProcessingLoader currentStatus={status} />
        )}

        {/* Campaign Studio View */}
        {viewState === 'slice-results' && uploadedImage && originalCloudinaryUrl && (
          <div className="fixed inset-0 bg-background p-4 z-50">
            <CampaignStudio
              slices={processedSlices}
              onSlicesChange={setProcessedSlices}
              originalImageUrl={originalCloudinaryUrl}
              brandUrl="https://www.enhanced.com"
              onBack={() => setViewState('slice-editor')}
              onCreateTemplate={() => createTemplate('template')}
              onCreateCampaign={() => createTemplate('campaign')}
              onConvertToHtml={convertSliceToHtml}
              isCreating={isProcessing}
              templateId={templateId}
              campaignId={campaignId}
              onReset={resetUpload}
            />
          </div>
        )}

        {/* Success State - Campaign Mode */}
        {viewState === 'success' && templateId && campaignId && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Campaign created with {processedSlices.length} slices!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your sliced email template has been created and added to a new campaign.
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => window.open(`https://www.klaviyo.com/email-template-editor/campaign/${campaignId}/content/edit`, '_blank')}
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
        {viewState === 'success' && templateId && !campaignId && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Template created with {processedSlices.length} slices!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Important:</strong> To edit this template with drag-and-drop, use it in a Campaign or Flow.
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
                <Rocket className="w-4 h-4 mr-2" />
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
