import { useState, useRef } from 'react';
import { Upload, Loader2, Check, X, AlertTriangle, Image } from 'lucide-react';
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

interface AssetNeedingConfirmation {
  id: string;
  description: string;
  reason: string;
  library_url: string;
}

interface AssetNeedingUpload {
  id: string;
  description: string;
  category: string;
}

interface AssetCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needsConfirmation: AssetNeedingConfirmation[];
  needsUpload: AssetNeedingUpload[];
  socialPlatforms: string[];
  brandDomain: string;
  onComplete: (collectedAssets: Record<string, string>) => void;
}

export function AssetCollectionModal({
  open,
  onOpenChange,
  needsConfirmation,
  needsUpload,
  socialPlatforms,
  brandDomain,
  onComplete
}: AssetCollectionModalProps) {
  // Track decisions for confirmation items
  const [confirmationDecisions, setConfirmationDecisions] = useState<Record<string, 'use_library' | 'upload'>>({});
  
  // Track uploaded files
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, string>>({});
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleConfirmationDecision = (assetId: string, decision: 'use_library' | 'upload') => {
    setConfirmationDecisions(prev => ({ ...prev, [assetId]: decision }));
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

    // Add assets where user chose to use library
    for (const asset of needsConfirmation) {
      const decision = confirmationDecisions[asset.id];
      if (decision === 'use_library') {
        collectedAssets[asset.id] = asset.library_url;
      } else if (decision === 'upload' && uploadedAssets[asset.id]) {
        collectedAssets[asset.id] = uploadedAssets[asset.id];
      }
    }

    // Add uploaded assets
    for (const asset of needsUpload) {
      if (uploadedAssets[asset.id]) {
        collectedAssets[asset.id] = uploadedAssets[asset.id];
      }
    }

    onComplete(collectedAssets);
    setIsProcessing(false);
  };

  // Check if we can proceed
  const canProceed = () => {
    // All confirmation items need a decision
    for (const asset of needsConfirmation) {
      const decision = confirmationDecisions[asset.id];
      if (!decision) return false;
      // If they chose upload, they need to have uploaded
      if (decision === 'upload' && !uploadedAssets[asset.id]) return false;
    }
    
    // Upload items are optional (user can skip)
    return true;
  };

  const totalItems = needsConfirmation.length + needsUpload.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assets Needed</DialogTitle>
          <DialogDescription>
            We identified {totalItems} asset{totalItems !== 1 ? 's' : ''} in your design that need{totalItems === 1 ? 's' : ''} attention.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4 space-y-6">
          {/* Confirmation needed section */}
          {needsConfirmation.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Confirm or Replace
              </h3>
              
              {needsConfirmation.map(asset => (
                <div key={asset.id} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    {asset.library_url && (
                      <div className="w-16 h-16 rounded border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden">
                        <img 
                          src={asset.library_url} 
                          alt="Library asset" 
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{asset.description}</p>
                      <p className="text-xs text-muted-foreground">{asset.reason}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant={confirmationDecisions[asset.id] === 'use_library' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleConfirmationDecision(asset.id, 'use_library')}
                      className="flex-1"
                    >
                      {confirmationDecisions[asset.id] === 'use_library' && (
                        <Check className="w-3 h-3 mr-1" />
                      )}
                      Use library version
                    </Button>
                    <Button
                      variant={confirmationDecisions[asset.id] === 'upload' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleConfirmationDecision(asset.id, 'upload')}
                      className="flex-1"
                    >
                      {confirmationDecisions[asset.id] === 'upload' && (
                        <Check className="w-3 h-3 mr-1" />
                      )}
                      Upload different
                    </Button>
                  </div>

                  {/* Show upload input if they chose upload */}
                  {confirmationDecisions[asset.id] === 'upload' && (
                    <div>
                      {uploadedAssets[asset.id] ? (
                        <div className="flex items-center gap-2 text-sm text-primary">
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
                              <span className="text-sm">Upload {asset.description}</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={el => fileInputRefs.current[asset.id] = el}
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
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload needed section */}
          {needsUpload.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                Upload Required (or skip)
              </h3>
              
              {needsUpload.map(asset => (
                <div key={asset.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{asset.description}</p>
                      <p className="text-xs text-muted-foreground capitalize">{asset.category}</p>
                    </div>
                    {uploadedAssets[asset.id] && (
                      <div className="w-10 h-10 rounded border border-border/50 overflow-hidden">
                        <img 
                          src={uploadedAssets[asset.id]} 
                          alt="Uploaded" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                  
                  {uploadedAssets[asset.id] ? (
                    <div className="flex items-center gap-2 text-sm text-primary">
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
                          <span className="text-sm">Upload or skip</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={el => fileInputRefs.current[asset.id] = el}
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
            </div>
          )}

          {/* Social icons note */}
          {socialPlatforms.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-1">
                <Image className="w-4 h-4" />
                Social Icons
              </h4>
              <p className="text-xs text-muted-foreground">
                We'll automatically use properly styled icons for: {socialPlatforms.join(', ')}
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
