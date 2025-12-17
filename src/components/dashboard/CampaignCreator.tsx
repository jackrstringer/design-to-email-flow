import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SliceEditor } from '@/components/SliceEditor';
import { sliceImage } from '@/lib/imageSlicing';
import type { Brand } from '@/types/brand-assets';
import type { SliceType } from '@/types/slice';

interface PendingCampaign {
  file: File;
  dataUrl: string;
}

interface DetectedBrand {
  name: string | null;
  url: string | null;
}

interface CampaignCreatorProps {
  brands: Brand[];
  selectedBrandId: string | null;
  onBrandSelect: (brandId: string | null) => void;
  selectedBrand: Brand | null;
  includeFooter: boolean;
  onIncludeFooterChange: (include: boolean) => void;
  onBrandDetected: (detectedBrand: DetectedBrand, campaignData: PendingCampaign) => void;
  onAddBrandClick: () => void;
  isLoading: boolean;
  pendingCampaign: PendingCampaign | null;
  onCampaignProcessed: () => void;
}

type ViewState = 'upload' | 'slice-editor' | 'processing';

export function CampaignCreator({
  brands,
  selectedBrandId,
  onBrandSelect,
  selectedBrand,
  includeFooter,
  onIncludeFooterChange,
  onBrandDetected,
  onAddBrandClick,
  isLoading,
  pendingCampaign,
  onCampaignProcessed,
}: CampaignCreatorProps) {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasFooters, setHasFooters] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('upload');
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null);

  // Check if selected brand has footers
  useEffect(() => {
    const checkFooters = async () => {
      if (!selectedBrand?.id) {
        setHasFooters(false);
        return;
      }

      const { count, error } = await supabase
        .from('brand_footers')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', selectedBrand.id);

      if (!error && count !== null) {
        setHasFooters(count > 0);
      }
    };

    checkFooters();
  }, [selectedBrand?.id]);

  // When pending campaign is set and brand has API key, show slice editor
  useEffect(() => {
    if (pendingCampaign && selectedBrand?.klaviyoApiKey && viewState === 'upload') {
      setUploadedImageDataUrl(pendingCampaign.dataUrl);
      setViewState('slice-editor');
    }
  }, [pendingCampaign, selectedBrand, viewState]);

  const processSlices = async (slicePositions: number[], sliceTypes: SliceType[]) => {
    if (!selectedBrand?.klaviyoApiKey || !uploadedImageDataUrl) return;
    
    setViewState('processing');
    setIsProcessing(true);
    
    try {
      // Upload original image to Cloudinary
      const { data: originalUpload, error: originalError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageData: uploadedImageDataUrl }
      });

      if (originalError || !originalUpload?.url) {
        throw new Error('Failed to upload original image');
      }

      // Slice the image
      const slices = await sliceImage(uploadedImageDataUrl, slicePositions);
      
      // Upload each slice to Cloudinary
      const uploadedSlices = await Promise.all(
        slices.map(async (slice, index) => {
          const { data: sliceUpload, error: sliceError } = await supabase.functions.invoke('upload-to-cloudinary', {
            body: { imageData: slice.dataUrl }
          });

          if (sliceError || !sliceUpload?.url) {
            throw new Error(`Failed to upload slice ${index}`);
          }

          return {
            ...slice,
            imageUrl: sliceUpload.url,
            type: sliceTypes[index] || 'image' as SliceType,
          };
        })
      );

      // Analyze slices with AI for alt text and links
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-slices', {
        body: {
          slices: uploadedSlices.map((s, i) => ({ dataUrl: s.dataUrl, index: i })),
          brandUrl: selectedBrand.websiteUrl || `https://${selectedBrand.domain}`
        }
      });

      // Merge analysis data with uploaded slices
      const processedSlices = uploadedSlices.map((slice, index) => {
        const analysis = analysisData?.analyses?.find((a: any) => a.index === index);
        return {
          imageUrl: slice.imageUrl,
          startPercent: slice.startPercent,
          endPercent: slice.endPercent,
          width: slice.width,
          height: slice.height,
          type: slice.type,
          altText: analysis?.altText || `Email section ${index + 1}`,
          link: analysis?.suggestedLink || null,
          html: null,
        };
      });

      // Create campaign in database
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          brand_id: selectedBrand.id,
          name: `Campaign ${new Date().toLocaleDateString()}`,
          original_image_url: originalUpload.url,
          status: 'draft',
          blocks: processedSlices
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      onCampaignProcessed();

      // Navigate to campaign studio with processed slices
      navigate(`/campaign/${campaign.id}`, {
        state: {
          imageUrl: originalUpload.url,
          brand: selectedBrand,
          includeFooter,
          slices: processedSlices
        }
      });
    } catch (error) {
      console.error('Error processing slices:', error);
      toast.error('Failed to process slices');
      setViewState('slice-editor');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSliceCancel = () => {
    setViewState('upload');
    setUploadedImageDataUrl(null);
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        // Check if we already have a brand selected
        if (selectedBrand?.klaviyoApiKey) {
          // Go directly to slice editor
          setUploadedImageDataUrl(dataUrl);
          setViewState('slice-editor');
          setIsProcessing(false);
          return;
        }

        // Use lightweight brand detection
        const { data: brandData, error: brandError } = await supabase.functions.invoke('detect-brand-from-image', {
          body: { imageDataUrl: dataUrl }
        });

        setIsProcessing(false);

        if (brandError) {
          console.error('Brand detection error:', brandError);
          toast.error('Failed to detect brand. Please select or add a brand manually.');
          return;
        }

        const detectedBrand: DetectedBrand = {
          name: brandData?.name || null,
          url: brandData?.url || null,
        };

        // Check if detected brand matches an existing one
        if (detectedBrand.url) {
          let detectedDomain: string;
          try {
            detectedDomain = new URL(detectedBrand.url).hostname.replace('www.', '');
          } catch {
            detectedDomain = detectedBrand.url.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
          }

          const matchingBrand = brands.find(b => 
            b.domain.toLowerCase() === detectedDomain.toLowerCase()
          );

          if (matchingBrand) {
            // Auto-select matching brand and go to slice editor
            onBrandSelect(matchingBrand.id);
            setUploadedImageDataUrl(dataUrl);
            setViewState('slice-editor');
            return;
          }
        }

        // New brand - show confirmation modal
        if (detectedBrand.url || detectedBrand.name) {
          onBrandDetected(detectedBrand, { file, dataUrl });
        } else {
          toast.error('Could not detect brand. Please add a brand manually.');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Failed to process image');
      setIsProcessing(false);
    }
  }, [selectedBrand, brands, onBrandDetected, onBrandSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const waitingForApiKey = pendingCampaign && selectedBrand && !selectedBrand.klaviyoApiKey;

  // Show slice editor when in that state
  if (viewState === 'slice-editor' && uploadedImageDataUrl) {
    return (
      <div className="max-w-4xl mx-auto">
        <SliceEditor
          imageDataUrl={uploadedImageDataUrl}
          onProcess={processSlices}
          onCancel={handleSliceCancel}
          isProcessing={isProcessing}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Firecrawl-style input box */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="space-y-6">
          {/* Brand selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Brand</Label>
            <div className="flex gap-2">
              <Select
                value={selectedBrandId || ''}
                onValueChange={(value) => onBrandSelect(value || null)}
                disabled={isLoading}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a brand..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: brand.primaryColor }}
                        />
                        <span>{brand.name}</span>
                        {!brand.klaviyoApiKey && (
                          <span className="text-xs text-muted-foreground">(No API key)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={onAddBrandClick}
                title="Add new brand"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Include footer toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="include-footer" className="text-sm font-medium text-muted-foreground">
              Include Footer
            </Label>
            <Switch
              id="include-footer"
              checked={includeFooter}
              onCheckedChange={onIncludeFooterChange}
              disabled={!hasFooters}
            />
          </div>

          {/* Selected brand info */}
          {selectedBrand && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: selectedBrand.primaryColor }}
              >
                {selectedBrand.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedBrand.name}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedBrand.domain}</p>
              </div>
              {selectedBrand.klaviyoApiKey ? (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  API Connected
                </span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  No API Key
                </span>
              )}
            </div>
          )}

          {/* Waiting for API key message */}
          {waitingForApiKey && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-sm text-amber-800">
                Brand detected! Please add the Klaviyo API key to continue.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
          ${isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'
          }
          ${isProcessing ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">
            {isProcessing ? 'Detecting brand...' : 'Drop your campaign image here'}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG or JPG up to 20MB
          </p>
        </div>
      </div>

      {/* Empty state when no brands */}
      {!isLoading && brands.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-4">
            No brands configured yet. Drop an image to get started.
          </p>
          <Button onClick={onAddBrandClick}>
            <Plus className="w-4 h-4 mr-2" />
            Add Brand
          </Button>
        </div>
      )}
    </div>
  );
}
