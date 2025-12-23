import { useState, useCallback, useRef, useEffect } from 'react';
import { Scissors, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface FooterCropSelectorProps {
  imageUrl: string;
  onCrop: (croppedImageData: string) => void;
  onCancel: () => void;
}

export function FooterCropSelector({ imageUrl, onCrop, onCancel }: FooterCropSelectorProps) {
  const [cropPosition, setCropPosition] = useState(70); // Default 70% from top
  const [containerHeight, setContainerHeight] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [wasAutoDetected, setWasAutoDetected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startPosition = useRef(0);
  const hasDetected = useRef(false);

  // Auto-detect footer region when image loads
  const detectFooterRegion = useCallback(async () => {
    if (hasDetected.current || !imageUrl) return;
    hasDetected.current = true;
    setIsDetecting(true);

    try {
      const { data, error } = await supabase.functions.invoke('detect-footer-region', {
        body: { imageUrl }
      });

      if (!error && data?.footerStartPercent) {
        console.log('AI detected footer at:', data.footerStartPercent, 'confidence:', data.confidence);
        setCropPosition(data.footerStartPercent);
        setWasAutoDetected(true);
      }
    } catch (err) {
      console.error('Failed to auto-detect footer:', err);
    } finally {
      setIsDetecting(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.offsetHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setWasAutoDetected(false); // User is manually adjusting
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startPosition.current = cropPosition;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerHeight) return;
      
      const deltaY = moveEvent.clientY - startY.current;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPosition = Math.max(20, Math.min(95, startPosition.current + deltaPercent));
      setCropPosition(newPosition);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [cropPosition, containerHeight]);

  const handleCrop = useCallback(() => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate crop dimensions
    const startY = Math.floor((cropPosition / 100) * img.naturalHeight);
    const cropHeight = img.naturalHeight - startY;

    canvas.width = img.naturalWidth;
    canvas.height = cropHeight;

    // Draw the cropped portion
    ctx.drawImage(
      img,
      0, startY, img.naturalWidth, cropHeight, // source
      0, 0, img.naturalWidth, cropHeight // destination
    );

    // Convert to base64
    const croppedData = canvas.toDataURL('image/png');
    onCrop(croppedData);
  }, [cropPosition, onCrop]);

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="font-medium text-sm">Select footer region</h3>
        <p className="text-xs text-muted-foreground">
          Drag the line to define where your footer starts
        </p>
      </div>

      {/* Image container with crop line */}
      <div 
        ref={containerRef}
        className="relative rounded-lg border border-border overflow-hidden bg-muted/20"
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Campaign to crop"
          className="w-full"
          crossOrigin="anonymous"
          onLoad={() => {
            if (containerRef.current) {
              setContainerHeight(containerRef.current.offsetHeight);
            }
            // Trigger AI detection when image loads
            detectFooterRegion();
          }}
        />

        {/* AI Detection loading overlay */}
        {isDetecting && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="bg-background border border-border rounded-lg px-4 py-3 flex items-center gap-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Detecting footer...</span>
            </div>
          </div>
        )}

        {/* Overlay for non-selected area (above the line) */}
        <div 
          className="absolute top-0 left-0 right-0 bg-background/60 pointer-events-none"
          style={{ height: `${cropPosition}%` }}
        />

        {/* Crop line */}
        <div
          className="absolute left-0 right-0 z-20 cursor-ns-resize group"
          style={{ top: `${cropPosition}%`, transform: 'translateY(-50%)' }}
          onMouseDown={handleMouseDown}
        >
          {/* Line */}
          <div className="absolute left-0 right-0 h-0.5 border-t-2 border-dashed border-primary" />
          
          {/* Handle */}
          <div className={cn(
            "absolute left-1/2 -translate-x-1/2 -translate-y-1/2",
            "px-3 py-1 rounded-full flex items-center gap-1.5",
            "text-xs font-medium whitespace-nowrap",
            "shadow-lg transition-transform hover:scale-105",
            wasAutoDetected 
              ? "bg-gradient-to-r from-primary to-purple-500 text-primary-foreground" 
              : "bg-primary text-primary-foreground"
          )}>
            {wasAutoDetected ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              <Scissors className="w-3 h-3" />
            )}
            <span>{wasAutoDetected ? 'AI detected' : 'Footer starts here'}</span>
          </div>
        </div>

        {/* Selected footer region highlight */}
        <div 
          className="absolute left-0 right-0 bottom-0 pointer-events-none border-2 border-primary/50"
          style={{ height: `${100 - cropPosition}%` }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-medium text-primary-foreground bg-primary/90 px-2 py-0.5 rounded">
            Footer region
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleCrop}>
          <Check className="w-4 h-4 mr-1" />
          Use this section
        </Button>
      </div>
    </div>
  );
}
