import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Check, X, Image } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AssetNeeded {
  id: string;
  description: string;
  location: string;
  category: string;
  crop_hint?: {
    x_percent: number;
    y_percent: number;
    width_percent: number;
    height_percent: number;
  };
}

interface TextBasedElement {
  id: string;
  description: string;
  recommendation: string;
}

interface BrandLibrary {
  logo?: string;
  darkLogo?: string;
  lightLogo?: string;
  footerLogo?: string;
}

interface AssetCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceImageUrl: string;
  assetsNeeded: AssetNeeded[];
  textBasedElements: TextBasedElement[];
  socialPlatforms: string[];
  brandLibrary: BrandLibrary;
  brandDomain: string;
  onComplete: (collectedAssets: Record<string, string>) => void;
}

// Component to show cropped preview from reference image
function CroppedPreview({ 
  referenceImageUrl, 
  cropHint 
}: { 
  referenceImageUrl: string; 
  cropHint?: AssetNeeded['crop_hint'];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!cropHint || !referenceImageUrl) return;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const x = (cropHint.x_percent / 100) * img.width;
      const y = (cropHint.y_percent / 100) * img.height;
      const width = (cropHint.width_percent / 100) * img.width;
      const height = (cropHint.height_percent / 100) * img.height;

      // Set canvas size to match crop region aspect ratio
      const maxSize = 80;
      const aspectRatio = width / height;
      if (aspectRatio > 1) {
        canvas.width = maxSize;
        canvas.height = maxSize / aspectRatio;
      } else {
        canvas.height = maxSize;
        canvas.width = maxSize * aspectRatio;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
        setLoaded(true);
      }
    };
    img.src = referenceImageUrl;
  }, [referenceImageUrl, cropHint]);

  if (!cropHint) {
    return (
      <div className="w-16 h-16 rounded border border-border/50 bg-muted/30 flex items-center justify-center">
        <Image className="w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-20 h-20 rounded border border-border/50 bg-muted/30 flex items-center justify-center overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className={`max-w-full max-h-full object-contain ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {!loaded && <Loader2 className="w-4 h-4 animate-spin absolute" />}
    </div>
  );
}

export function AssetCollectionModal({
  open,
  onOpenChange,
  referenceImageUrl,
  assetsNeeded,
  textBasedElements,
  socialPlatforms,
  brandLibrary,
  brandDomain,
  onComplete
}: AssetCollectionModalProps) {
  // Track user choice for each asset: 'upload' | 'library'
  const [assetChoices, setAssetChoices] = useState<Record<string, 'upload' | 'library'>>({});
  
  // Track uploaded files
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, string>>({});
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get library asset for a given asset based on category
  const getLibraryAsset = (asset: AssetNeeded): string | null => {
    if (asset.category === 'logo') {
      return brandLibrary.footerLogo || brandLibrary.darkLogo || brandLibrary.lightLogo || brandLibrary.logo || null;
    }
    return null;
  };

  const handleFileUpload = async (assetId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploadingAsset(assetId);
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
          folder: `brands/${brandDomain}/custom-assets`,
          publicId: assetId,
        },
      });

      if (error) throw error;

      setUploadedAssets(prev => ({ ...prev, [assetId]: data.url }));
      setAssetChoices(prev => ({ ...prev, [assetId]: 'upload' }));
      toast.success('Asset uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload asset');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleComplete = () => {
    setIsProcessing(true);
    
    const collectedAssets: Record<string, string> = {};

    for (const asset of assetsNeeded) {
      const choice = assetChoices[asset.id];
      const libraryUrl = getLibraryAsset(asset);
      
      if (choice === 'library' && libraryUrl) {
        collectedAssets[asset.id] = libraryUrl;
      } else if (choice === 'upload' && uploadedAssets[asset.id]) {
        collectedAssets[asset.id] = uploadedAssets[asset.id];
      }
      // If no choice made and no upload, skip the asset
    }

    onComplete(collectedAssets);
    setIsProcessing(false);
  };

  // Check if we can proceed - at least made a decision or uploaded for required assets
  const canProceed = () => {
    for (const asset of assetsNeeded) {
      const choice = assetChoices[asset.id];
      const libraryUrl = getLibraryAsset(asset);
      
      // If they chose library but there's no library asset, can't proceed
      if (choice === 'library' && !libraryUrl) return false;
      
      // If they chose upload but haven't uploaded, can't proceed
      if (choice === 'upload' && !uploadedAssets[asset.id]) return false;
      
      // If no choice made at all, that's okay - they can skip
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Required Assets</DialogTitle>
          <DialogDescription>
            We found {assetsNeeded.length} asset{assetsNeeded.length !== 1 ? 's' : ''} that need{assetsNeeded.length === 1 ? 's' : ''} to be provided.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4 space-y-4">
          {/* Assets needing upload/choice */}
          {assetsNeeded.map(asset => {
            const libraryUrl = getLibraryAsset(asset);
            const choice = assetChoices[asset.id];
            
            return (
              <div key={asset.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {/* Cropped preview from reference */}
                  <CroppedPreview 
                    referenceImageUrl={referenceImageUrl} 
                    cropHint={asset.crop_hint} 
                  />
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{asset.description}</p>
                    <p className="text-xs text-muted-foreground">{asset.location}</p>
                  </div>
                </div>

                <RadioGroup 
                  value={choice || ''} 
                  onValueChange={(val) => setAssetChoices(prev => ({ ...prev, [asset.id]: val as 'upload' | 'library' }))}
                  className="space-y-2"
                >
                  {/* Upload option */}
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="upload" id={`${asset.id}-upload`} className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`${asset.id}-upload`} className="text-sm cursor-pointer">
                        Upload new file
                      </Label>
                      
                      {choice === 'upload' && (
                        <>
                          {uploadedAssets[asset.id] ? (
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <div className="w-10 h-10 rounded border border-border/50 overflow-hidden">
                                <img src={uploadedAssets[asset.id]} alt="Uploaded" className="w-full h-full object-contain" />
                              </div>
                              <Check className="w-4 h-4" />
                              <span>Uploaded</span>
                              <button 
                                onClick={() => setUploadedAssets(prev => {
                                  const next = { ...prev };
                                  delete next[asset.id];
                                  return next;
                                })}
                                className="ml-auto text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-border cursor-pointer hover:bg-muted/20 transition-colors">
                              {uploadingAsset === asset.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  <span className="text-sm">Choose file...</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(asset.id, file);
                                  e.target.value = '';
                                }}
                                disabled={uploadingAsset !== null}
                              />
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Library option (only if we have one) */}
                  {libraryUrl && (
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="library" id={`${asset.id}-library`} className="mt-1" />
                      <Label htmlFor={`${asset.id}-library`} className="flex items-center gap-3 cursor-pointer">
                        <div className="w-10 h-10 rounded border border-border/50 bg-muted/20 overflow-hidden flex items-center justify-center">
                          <img src={libraryUrl} alt="Library asset" className="max-w-full max-h-full object-contain" />
                        </div>
                        <span className="text-sm">Use from library</span>
                      </Label>
                    </div>
                  )}
                </RadioGroup>
              </div>
            );
          })}

          {/* Text-based elements - just informational */}
          {textBasedElements.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Text/CSS Elements (no upload needed)
              </h4>
              <div className="space-y-1">
                {textBasedElements.map(el => (
                  <p key={el.id} className="text-xs text-muted-foreground">
                    • {el.description}: {el.recommendation}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Social icons note */}
          {socialPlatforms.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-primary" />
                Social Icons Ready
              </h4>
              <p className="text-xs text-muted-foreground">
                {socialPlatforms.join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleComplete} 
            disabled={!canProceed() || isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
