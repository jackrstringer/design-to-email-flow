import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Check, Image } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

interface AssetCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceImageUrl: string;
  assetsNeeded: AssetNeeded[];
  textBasedElements: TextBasedElement[];
  socialPlatforms: string[];
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

      // Use naturalWidth/naturalHeight for accurate calculations
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;

      // Calculate crop region with bounds clamping
      let x = Math.max(0, (cropHint.x_percent / 100) * naturalW);
      let y = Math.max(0, (cropHint.y_percent / 100) * naturalH);
      let width = (cropHint.width_percent / 100) * naturalW;
      let height = (cropHint.height_percent / 100) * naturalH;

      // Clamp to image bounds
      if (x + width > naturalW) width = naturalW - x;
      if (y + height > naturalH) height = naturalH - y;
      
      // Ensure minimum size
      width = Math.max(width, 10);
      height = Math.max(height, 10);

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
    img.onerror = () => {
      console.error('Failed to load image for crop preview');
      setLoaded(false);
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
    <div className="w-20 h-20 rounded border border-border/50 bg-muted/30 flex items-center justify-center overflow-hidden relative">
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
  brandDomain,
  onComplete
}: AssetCollectionModalProps) {
  // Track uploaded files
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, string>>({});
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOverAsset, setDragOverAsset] = useState<string | null>(null);

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
          folder: `brands/${brandDomain}/footer-assets`,
          publicId: assetId,
        },
      });

      if (error) throw error;

      setUploadedAssets(prev => ({ ...prev, [assetId]: data.url }));
      toast.success('Asset uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload asset');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleDrop = (assetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverAsset(null);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(assetId, file);
  };

  const handleComplete = () => {
    setIsProcessing(true);
    onComplete(uploadedAssets);
    setIsProcessing(false);
  };

  // All assets must be uploaded to proceed
  const canProceed = assetsNeeded.every(asset => uploadedAssets[asset.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assets Required</DialogTitle>
          <DialogDescription>
            Upload {assetsNeeded.length} asset{assetsNeeded.length !== 1 ? 's' : ''} to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4 space-y-4">
          {/* Assets needing upload */}
          {assetsNeeded.map(asset => (
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

              {/* Upload dropzone */}
              {uploadedAssets[asset.id] ? (
                <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                  <div className="w-12 h-12 rounded border border-border/50 overflow-hidden bg-muted/20 flex items-center justify-center">
                    <img src={uploadedAssets[asset.id]} alt="Uploaded" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-primary flex items-center gap-1">
                      <Check className="w-4 h-4" /> Uploaded
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setUploadedAssets(prev => {
                      const next = { ...prev };
                      delete next[asset.id];
                      return next;
                    })}
                  >
                    Replace
                  </Button>
                </div>
              ) : (
                <label
                  onDrop={(e) => handleDrop(asset.id, e)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverAsset(asset.id); }}
                  onDragLeave={() => setDragOverAsset(null)}
                  className={`flex flex-col items-center justify-center gap-2 h-20 rounded-md border-2 border-dashed cursor-pointer transition-colors ${
                    dragOverAsset === asset.id 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/20'
                  }`}
                >
                  {uploadingAsset === asset.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Drop file or click to upload</span>
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
            </div>
          ))}

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
            disabled={!canProceed || isProcessing}
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
