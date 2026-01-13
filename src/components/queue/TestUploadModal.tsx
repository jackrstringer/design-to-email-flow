import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface TestUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TestUploadModal({ open, onClose, onSuccess }: TestUploadModalProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Auto-generate name from filename
      if (!campaignName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setCampaignName(nameWithoutExt);
      }
    }
  }, [campaignName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    multiple: false
  });

  const handleUpload = async () => {
    if (!imageFile || !user) return;

    setUploading(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(imageFile);
      });
      const base64Data = await base64Promise;

      // Upload to Cloudinary
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: {
          imageBase64: base64Data,
          folder: 'campaign-queue'
        }
      });

      if (uploadError) throw uploadError;

      const imageUrl = uploadData?.url || uploadData?.secure_url;
      if (!imageUrl) throw new Error('No image URL returned');

      // Get image dimensions
      const img = new Image();
      const dimensionsPromise = new Promise<{ width: number; height: number }>((resolve) => {
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.src = base64Data;
      });
      const dimensions = await dimensionsPromise;

      // Create queue item
      const { data: queueItem, error: insertError } = await supabase
        .from('campaign_queue')
        .insert({
          user_id: user.id,
          source: 'upload',
          name: campaignName || 'Test Campaign',
          image_url: imageUrl,
          image_width: dimensions.width,
          image_height: dimensions.height,
          status: 'processing',
          processing_step: 'queued',
          processing_percent: 0
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      toast.success('Campaign added to queue!');

      // Trigger processing
      supabase.functions.invoke('process-campaign-queue', {
        body: { campaignQueueId: queueItem.id }
      }).catch(err => {
        console.error('Processing trigger error:', err);
      });

      // Reset and close
      setPreview(null);
      setImageFile(null);
      setCampaignName('');
      onSuccess();
      onClose();

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload campaign');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setPreview(null);
      setImageFile(null);
      setCampaignName('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Test Campaign</DialogTitle>
          <DialogDescription>
            Upload an email design image to test the processing pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campaign Name */}
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="My Test Campaign"
              disabled={uploading}
            />
          </div>

          {/* Drop Zone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
              ${uploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            
            {preview ? (
              <div className="relative">
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="max-h-64 mx-auto rounded-md"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(null);
                    setImageFile(null);
                  }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="py-4">
                <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive 
                    ? 'Drop the image here...' 
                    : 'Drag & drop an email image, or click to select'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, or WebP
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={!imageFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Add to Queue
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
