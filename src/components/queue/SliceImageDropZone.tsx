import { useRef, useState, useCallback } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SliceImageDropZoneProps {
  imageUrl?: string;
  altText?: string;
  htmlContent?: string;
  type?: 'image' | 'html';
  brandId?: string | null;
  onUploaded: (newImageUrl: string) => void;
  children?: React.ReactNode;
}

const ACCEPTED = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif';
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SliceImageDropZone({
  imageUrl,
  altText,
  htmlContent,
  type,
  brandId,
  onUploaded,
  children,
}: SliceImageDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please drop an image or GIF file');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`File is too large (max ${MAX_BYTES / 1024 / 1024}MB)`);
      return;
    }

    setIsUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const folder = brandId ? `campaign-slices/${brandId}` : 'campaign-slices';

      const { data, error } = await supabase.functions.invoke('upload-to-imagekit', {
        body: {
          imageData: dataUrl,
          folder,
          fileName: file.name,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('Upload returned no URL');

      onUploaded(data.url);
      toast.success(`Image swapped${file.type === 'image/gif' ? ' (GIF)' : ''}`);
    } catch (err) {
      console.error('Slice image upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [brandId, onUploaded]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const isHtml = type === 'html' && htmlContent;

  return (
    <div
      className={cn(
        'relative group/swap cursor-pointer',
        isDragging && 'ring-2 ring-primary ring-offset-1',
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={(e) => {
        e.stopPropagation();
        if (!isUploading) inputRef.current?.click();
      }}
      title="Click or drop an image/GIF to swap this slice"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />

      {children ?? (
        isHtml ? (
          <div
            className="bg-white"
            dangerouslySetInnerHTML={{ __html: htmlContent! }}
            style={{ width: '100%' }}
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={altText || 'Slice'}
            style={{ width: '100%' }}
            className="block"
          />
        ) : (
          <div
            className="bg-muted flex items-center justify-center text-muted-foreground text-xs"
            style={{ width: '100%', height: 60 }}
          >
            No image
          </div>
        )
      )}

      {/* Hover overlay */}
      {!isUploading && !isDragging && (
        <div className="absolute inset-0 bg-black/0 group-hover/swap:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover/swap:opacity-100 pointer-events-none">
          <div className="bg-background/95 border border-border rounded-md px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
            <Upload className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium">Click or drop to swap</span>
          </div>
        </div>
      )}

      {/* Drag-over overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/20 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="bg-background border border-primary rounded-md px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
            <Upload className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Drop image or GIF</span>
          </div>
        </div>
      )}

      {/* Uploading overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-background/70 flex items-center justify-center pointer-events-none">
          <div className="bg-background border rounded-md px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">Uploading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
