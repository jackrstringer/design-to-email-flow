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
import type { Brand } from '@/types/brand-assets';

interface PendingCampaign {
  file: File;
  dataUrl: string;
  detectedDomain: string | null;
  analysisData: any;
}

interface CampaignCreatorProps {
  brands: Brand[];
  selectedBrandId: string | null;
  onBrandSelect: (brandId: string | null) => void;
  selectedBrand: Brand | null;
  includeFooter: boolean;
  onIncludeFooterChange: (include: boolean) => void;
  onBrandDetected: (domain: string, campaignData: PendingCampaign) => void;
  onAddBrandClick: () => void;
  isLoading: boolean;
  pendingCampaign: PendingCampaign | null;
  onCampaignProcessed: () => void;
}

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

  // Process pending campaign when brand is selected and has API key
  useEffect(() => {
    if (pendingCampaign && selectedBrand?.klaviyoApiKey && !isProcessing) {
      processCampaign(pendingCampaign.dataUrl, pendingCampaign.analysisData);
    }
  }, [pendingCampaign, selectedBrand]);

  const processCampaign = async (dataUrl: string, analysisData: any) => {
    if (!selectedBrand?.klaviyoApiKey) return;
    
    setIsProcessing(true);
    try {
      // Upload to Cloudinary
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageDataUrl: dataUrl }
      });

      if (uploadError || !uploadData?.url) {
        throw new Error('Failed to upload image');
      }

      // Create campaign in database
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          brand_id: selectedBrand.id,
          name: `Campaign ${new Date().toLocaleDateString()}`,
          original_image_url: uploadData.url,
          status: 'draft'
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      onCampaignProcessed();

      // Navigate to campaign studio
      navigate(`/campaign/${campaign.id}`, {
        state: {
          imageUrl: uploadData.url,
          brand: selectedBrand,
          includeFooter,
          blocks: analysisData?.blocks || []
        }
      });
    } catch (error) {
      console.error('Error processing campaign:', error);
      toast.error('Failed to process campaign');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setIsProcessing(true);

    try {
      // Convert to data URL for analysis
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        // Always analyze the image first to detect brand
        const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-email-design', {
          body: { 
            imageDataUrl: dataUrl,
            width: 600,
            height: 2000
          }
        });

        if (analysisError) {
          console.error('Analysis error:', analysisError);
        }

        // Extract detected domain
        let detectedDomain: string | null = null;
        if (analysisData?.detectedBrand?.url) {
          try {
            detectedDomain = new URL(analysisData.detectedBrand.url).hostname.replace('www.', '');
          } catch {}
        }

        const campaignData: PendingCampaign = {
          file,
          dataUrl,
          detectedDomain,
          analysisData
        };

        if (detectedDomain) {
          // Let parent handle brand detection/creation
          onBrandDetected(detectedDomain, campaignData);
          setIsProcessing(false);
        } else if (selectedBrand?.klaviyoApiKey) {
          // No brand detected but we have one selected - use it
          processCampaign(dataUrl, analysisData);
        } else {
          // No brand detected and none selected - prompt to add one
          toast.error('Could not detect brand. Please select or add a brand first.');
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Failed to process image');
      setIsProcessing(false);
    }
  }, [selectedBrand, includeFooter, onBrandDetected, navigate]);

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

  // Show waiting state when we have a pending campaign but no API key
  const waitingForApiKey = pendingCampaign && selectedBrand && !selectedBrand.klaviyoApiKey;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Upload zone - PRIMARY interaction */}
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
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">
            {isProcessing ? 'Processing...' : 'Drop your campaign image here'}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG or JPG • Brand will be auto-detected
          </p>
        </div>
      </div>

      {/* Waiting for API key message */}
      {waitingForApiKey && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-800">
            Brand detected! Please add the Klaviyo API key to continue.
          </p>
        </div>
      )}

      {/* Brand context - shown when brand is selected */}
      {selectedBrand && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: selectedBrand.primaryColor }}
              >
                {selectedBrand.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">{selectedBrand.name}</p>
                <p className="text-xs text-muted-foreground">{selectedBrand.domain}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {selectedBrand.klaviyoApiKey ? (
                <span className="text-xs text-green-600">Connected</span>
              ) : (
                <span className="text-xs text-amber-600">No API Key</span>
              )}
              <div className="flex items-center gap-2">
                <Label htmlFor="include-footer" className="text-xs text-muted-foreground">
                  Footer
                </Label>
                <Switch
                  id="include-footer"
                  checked={includeFooter}
                  onCheckedChange={onIncludeFooterChange}
                  disabled={!hasFooters}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optional: Manual brand selection */}
      {!selectedBrand && brands.length > 0 && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-2">Or select a brand manually:</p>
          <div className="flex justify-center gap-2">
            <Select
              value={selectedBrandId || ''}
              onValueChange={(value) => onBrandSelect(value || null)}
              disabled={isLoading}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select brand..." />
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
      )}

      {/* Empty state when no brands */}
      {!isLoading && brands.length === 0 && !selectedBrand && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Drop an image above to get started. We'll detect the brand automatically.
          </p>
        </div>
      )}
    </div>
  );
}
