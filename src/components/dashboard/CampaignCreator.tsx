import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Link2, Image } from 'lucide-react';
import { ProcessingLoader } from '@/components/ProcessingLoader';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { sliceImage, resizeImageForAI, ColumnConfig } from '@/lib/imageSlicing';
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

interface FigmaDesignData {
  colors: string[];
  fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }>;
  texts: Array<{ content: string; isUrl: boolean }>;
  spacing: { paddings: number[]; gaps: number[] };
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
type SourceType = 'image' | 'figma';

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
  
  // Figma source state
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [isFetchingFigma, setIsFetchingFigma] = useState(false);
  const [figmaDesignData, setFigmaDesignData] = useState<FigmaDesignData | null>(null);
  const [status, setStatus] = useState<string>('');

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

  const processSlices = async (slicePositions: number[], sliceTypes: SliceType[], columnConfigs: ColumnConfig[]) => {
    if (!selectedBrand?.klaviyoApiKey || !uploadedImageDataUrl) return;
    
    setIsProcessing(true);
    setStatus('Uploading original image...');
    
    try {
      // Upload original image to Cloudinary
      const { data: originalUpload, error: originalError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageData: uploadedImageDataUrl }
      });

      if (originalError || !originalUpload?.url) {
        throw new Error('Failed to upload original image');
      }

      // Slice the image with column configs
      setStatus('Slicing image...');
      const slices = await sliceImage(uploadedImageDataUrl, slicePositions, columnConfigs);
      
      // Upload each slice to Cloudinary
      setStatus(`Uploading slice 1 of ${slices.length}...`);
      const uploadedSlices = await Promise.all(
        slices.map(async (slice, index) => {
          setStatus(`Uploading slice ${index + 1} of ${slices.length}...`);
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

      // Resize full campaign image for AI context (max 8000px)
      setStatus('Preparing for AI analysis...');
      const resizedFullImage = await resizeImageForAI(uploadedImageDataUrl);
      
      // Analyze slices with AI for alt text and links (with web search grounding)
      setStatus('Analyzing slices with AI...');
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-slices', {
        body: {
          slices: uploadedSlices.map((s, i) => ({ dataUrl: s.dataUrl, index: i })),
          fullCampaignImage: resizedFullImage, // Send full context for better link intelligence
          brandUrl: selectedBrand.websiteUrl || `https://${selectedBrand.domain}`,
          brandDomain: selectedBrand.domain, // Pass domain for site: search queries
          figmaDesignData: figmaDesignData // Pass Figma data if available
        }
      });

      // Build a Map keyed by index for reliable lookup (avoid find() issues)
      const analysisByIndex = new Map<number, any>();
      if (analysisData?.analyses) {
        for (const a of analysisData.analyses) {
          analysisByIndex.set(a.index, a);
        }
      }
      
      // Merge analysis data with uploaded slices, preserving column metadata
      const processedSlices = uploadedSlices.map((slice, index) => {
        const analysis = analysisByIndex.get(index);
        return {
          imageUrl: slice.imageUrl,
          startPercent: slice.startPercent,
          endPercent: slice.endPercent,
          width: slice.width,
          height: slice.height,
          type: slice.type,
          altText: analysis?.altText || `Email section ${index + 1}`,
          link: analysis?.suggestedLink || null,
          isClickable: analysis?.isClickable ?? false,
          linkVerified: analysis?.linkVerified || false,
          linkWarning: analysis?.linkWarning,
          html: null,
          figmaDesignData: figmaDesignData, // Attach Figma data for HTML generation
          column: slice.column,
          totalColumns: slice.totalColumns,
          rowIndex: slice.rowIndex,
        };
      });

      // Create campaign in database
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert([{
          brand_id: selectedBrand.id,
          name: `Campaign ${new Date().toLocaleDateString()}`,
          original_image_url: originalUpload.url,
          status: 'draft',
          blocks: JSON.parse(JSON.stringify(processedSlices))
        }])
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
          slices: processedSlices,
          figmaDesignData, // Pass along for HTML generation
        }
      });
    } catch (error) {
      console.error('Error processing slices:', error);
      toast.error('Failed to process slices');
      setViewState('slice-editor');
    } finally {
      setIsProcessing(false);
      setStatus('');
    }
  };

  const handleSliceCancel = () => {
    setViewState('upload');
    setUploadedImageDataUrl(null);
    setFigmaDesignData(null);
  };

  const handleFetchFigma = async () => {
    if (!figmaUrl.trim()) {
      toast.error('Please enter a Figma URL');
      return;
    }

    setIsFetchingFigma(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-figma-design', {
        body: { figmaUrl: figmaUrl.trim() }
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch Figma design');
      }

      if (!data?.exportedImageUrl) {
        throw new Error('Could not export Figma design as image');
      }

      // Fetch the exported PNG and convert to data URL
      const imageResponse = await fetch(data.exportedImageUrl);
      const blob = await imageResponse.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Store the extracted design data for later use
      if (data.designData) {
        setFigmaDesignData(data.designData);
        console.log('Figma design data extracted:', data.designData);
      }

      // If we have a configured brand, go directly to slice editor
      if (selectedBrand?.klaviyoApiKey) {
        setUploadedImageDataUrl(dataUrl);
        setViewState('slice-editor');
        toast.success('Figma design loaded! Add slice lines to continue.');
      } else {
        // Run brand auto-detection on the Figma export
        toast.info('Detecting brand...');
        
        let detectionImages: string[];
        try {
          detectionImages = await createBrandDetectionImages(dataUrl);
        } catch (cropErr) {
          console.error('Failed to prepare detection images:', cropErr);
          detectionImages = [dataUrl];
        }

        // Pass existing brands for AI-based matching
        const existingBrandsForMatching = brands.map(b => ({
          id: b.id,
          name: b.name,
          domain: b.domain,
          primaryColor: b.primaryColor
        }));

        const { data: brandData, error: brandError } = await supabase.functions.invoke('detect-brand-from-image', {
          body: { 
            imageDataUrls: detectionImages,
            existingBrands: existingBrandsForMatching
          }
        });

        if (brandError) {
          console.error('Brand detection error:', brandError);
          toast.error('Failed to detect brand. Please select or add a brand manually.');
          setUploadedImageDataUrl(dataUrl);
          return;
        }

        // Check if AI matched an existing brand
        if (brandData?.matchedBrandId) {
          const matchedBrand = brands.find(b => b.id === brandData.matchedBrandId);
          if (matchedBrand) {
            console.log('AI matched existing brand:', matchedBrand.name);
            onBrandSelect(matchedBrand.id);
            setUploadedImageDataUrl(dataUrl);
            setViewState('slice-editor');
            toast.success(`Figma design loaded! Brand "${matchedBrand.name}" detected.`);
            return;
          }
        }

        // New brand detected - show confirmation modal
        const detectedBrand: DetectedBrand = {
          name: brandData?.name || null,
          url: brandData?.url || null,
        };

        if (detectedBrand.url || detectedBrand.name) {
          // Create a fake file for the pending campaign flow
          const fakeFile = new File([blob], 'figma-export.png', { type: 'image/png' });
          onBrandDetected(detectedBrand, { file: fakeFile, dataUrl });
        } else {
          toast.error('Could not detect brand. Please select or add a brand manually.');
          setUploadedImageDataUrl(dataUrl);
        }
      }

    } catch (error) {
      console.error('Figma fetch error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch Figma design');
    } finally {
      setIsFetchingFigma(false);
    }
  };

  const createBrandDetectionImages = async (dataUrl: string): Promise<string[]> => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = document.createElement('img');
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = dataUrl;
    });

    // Reduced dimensions to avoid rate limits (smaller images = fewer tokens)
    const maxDim = 1200;
    const cropHeight = Math.min(img.naturalHeight, 800);

    const makeCrop = (sourceY: number) => {
      const sourceW = img.naturalWidth;
      const sourceH = cropHeight;
      const scale = Math.min(1, maxDim / sourceW, maxDim / sourceH);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceW * scale));
      canvas.height = Math.max(1, Math.round(sourceH * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      ctx.drawImage(
        img,
        0,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Lower quality JPEG to reduce token usage
      return canvas.toDataURL('image/jpeg', 0.6);
    };

    const top = makeCrop(0);
    const bottomY = Math.max(0, img.naturalHeight - cropHeight);
    const bottom = bottomY > 0 ? makeCrop(bottomY) : null;

    return bottom ? [top, bottom] : [top];
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

        // If we already have a configured brand selected, skip detection
        if (selectedBrand?.klaviyoApiKey) {
          setUploadedImageDataUrl(dataUrl);
          setViewState('slice-editor');
          setIsProcessing(false);
          return;
        }

        let detectionImages: string[];
        try {
          detectionImages = await createBrandDetectionImages(dataUrl);
        } catch (cropErr) {
          console.error('Failed to prepare detection images:', cropErr);
          detectionImages = [dataUrl];
        }

        // Pass existing brands for AI-based matching
        const existingBrandsForMatching = brands.map(b => ({
          id: b.id,
          name: b.name,
          domain: b.domain,
          primaryColor: b.primaryColor
        }));

        const { data: brandData, error: brandError } = await supabase.functions.invoke('detect-brand-from-image', {
          body: { 
            imageDataUrls: detectionImages,
            existingBrands: existingBrandsForMatching
          }
        });

        setIsProcessing(false);

        if (brandError) {
          console.error('Brand detection error:', brandError);
          toast.error('Failed to detect brand. Please select or add a brand manually.');
          return;
        }

        // Check if AI matched an existing brand
        if (brandData?.matchedBrandId) {
          const matchedBrand = brands.find(b => b.id === brandData.matchedBrandId);
          if (matchedBrand) {
            console.log('AI matched existing brand:', matchedBrand.name);
            onBrandSelect(matchedBrand.id);
            setUploadedImageDataUrl(dataUrl);
            setViewState('slice-editor');
            return;
          }
        }

        // New brand detected
        const detectedBrand: DetectedBrand = {
          name: brandData?.name || null,
          url: brandData?.url || null,
        };

        // Show confirmation modal for new brand
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
      <>
        <SliceEditor
          imageDataUrl={uploadedImageDataUrl}
          onProcess={processSlices}
          onCancel={handleSliceCancel}
          isProcessing={isProcessing}
        />
        {isProcessing && status && (
          <ProcessingLoader currentStatus={status} />
        )}
      </>
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

      {/* Source selection tabs */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit mx-auto">
        <button
          onClick={() => setSourceType('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            sourceType === 'image'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Image className="w-4 h-4" />
          Upload Image
        </button>
        <button
          onClick={() => setSourceType('figma')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            sourceType === 'figma'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link2 className="w-4 h-4" />
          Paste Figma Link
        </button>
      </div>

      {/* Figma URL input */}
      {sourceType === 'figma' && (
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">Figma URL</Label>
            <div className="flex gap-2">
              <Input
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://www.figma.com/design/..."
                className="flex-1"
                disabled={isFetchingFigma}
              />
              <Button
                onClick={handleFetchFigma}
                disabled={isFetchingFigma || !figmaUrl.trim()}
              >
                {isFetchingFigma ? 'Fetching...' : 'Fetch'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a Figma frame URL. Make sure the frame is accessible (public or shared).
            </p>
          </div>
          
          {figmaDesignData && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-800 font-medium">Design data extracted</p>
              <p className="text-xs text-green-600 mt-1">
                {figmaDesignData.colors.length} colors, {figmaDesignData.fonts.length} font styles
              </p>
            </div>
          )}
        </div>
      )}

      {/* Upload zone - only show for image source */}
      {sourceType === 'image' && (
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
      )}

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
