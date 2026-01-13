import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SliceData {
  imageUrl?: string;
  altText?: string;
  link?: string;
  yStartPercent?: number;
  yEndPercent?: number;
}

interface QueueSlicePreviewProps {
  imageUrl: string;
  slices: SliceData[];
  footerStartPercent: number | null;
  onReprocess: (slices: SliceData[], footerPercent: number) => void;
  isReprocessing?: boolean;
}

export function QueueSlicePreview({
  imageUrl,
  slices: initialSlices,
  footerStartPercent: initialFooterPercent,
  onReprocess,
  isReprocessing = false,
}: QueueSlicePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageHeight, setImageHeight] = useState(0);
  const [slicePositions, setSlicePositions] = useState<number[]>([]);
  const [footerPosition, setFooterPosition] = useState(initialFooterPercent || 85);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [draggingFooter, setDraggingFooter] = useState(false);

  // Initialize slice positions from data
  useEffect(() => {
    if (initialSlices.length > 1) {
      const positions = initialSlices
        .slice(0, -1)
        .map((s) => s.yEndPercent || 0)
        .filter((p) => p > 0 && p < 100);
      setSlicePositions(positions);
    }
  }, [initialSlices]);

  useEffect(() => {
    if (initialFooterPercent) {
      setFooterPosition(initialFooterPercent);
    }
  }, [initialFooterPercent]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageHeight(e.currentTarget.clientHeight);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedY = Math.max(5, Math.min(95, y));

      if (draggingIndex !== null) {
        setSlicePositions((prev) => {
          const newPositions = [...prev];
          newPositions[draggingIndex] = clampedY;
          return newPositions.sort((a, b) => a - b);
        });
        setHasChanges(true);
      } else if (draggingFooter) {
        setFooterPosition(clampedY);
        setHasChanges(true);
      }
    },
    [draggingIndex, draggingFooter]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
    setDraggingFooter(false);
  }, []);

  useEffect(() => {
    if (draggingIndex !== null || draggingFooter) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingIndex, draggingFooter, handleMouseMove, handleMouseUp]);

  const handleReprocessClick = () => {
    // Rebuild slices from positions
    const sortedPositions = [...slicePositions].sort((a, b) => a - b);
    const newSlices: SliceData[] = [];
    
    let lastEnd = 0;
    sortedPositions.forEach((pos, i) => {
      newSlices.push({
        yStartPercent: lastEnd,
        yEndPercent: pos,
        altText: initialSlices[i]?.altText,
        link: initialSlices[i]?.link,
      });
      lastEnd = pos;
    });
    
    // Add final slice before footer
    newSlices.push({
      yStartPercent: lastEnd,
      yEndPercent: footerPosition,
      altText: initialSlices[newSlices.length]?.altText,
      link: initialSlices[newSlices.length]?.link,
    });

    onReprocess(newSlices, footerPosition);
    setHasChanges(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Campaign Preview</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReprocessClick}
          disabled={!hasChanges || isReprocessing}
          className={cn(
            "transition-opacity",
            !hasChanges && "opacity-50"
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isReprocessing && "animate-spin")} />
          {isReprocessing ? 'Processing...' : 'Re-Process Slices'}
        </Button>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-lg border overflow-hidden bg-muted/20"
        style={{ cursor: draggingIndex !== null || draggingFooter ? 'ns-resize' : 'default' }}
      >
        <img
          src={imageUrl}
          alt="Campaign"
          className="w-full"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Slice lines */}
        {slicePositions.map((pos, index) => (
          <div
            key={index}
            className="absolute left-0 right-0 group"
            style={{ top: `${pos}%` }}
          >
            <div className="absolute left-0 right-0 h-0.5 bg-blue-500/70" />
            <div
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full cursor-ns-resize flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.preventDefault();
                setDraggingIndex(index);
              }}
            >
              <GripHorizontal className="h-3 w-3" />
              <span>Slice {index + 1}</span>
            </div>
          </div>
        ))}

        {/* Footer line */}
        <div
          className="absolute left-0 right-0 group"
          style={{ top: `${footerPosition}%` }}
        >
          <div className="absolute left-0 right-0 h-0.5 bg-orange-500/70" />
          <div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full cursor-ns-resize flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
            onMouseDown={(e) => {
              e.preventDefault();
              setDraggingFooter(true);
            }}
          >
            <GripHorizontal className="h-3 w-3" />
            <span>Footer</span>
          </div>
        </div>

        {/* Slice labels on the side */}
        {imageHeight > 0 && (
          <div className="absolute left-2 top-0 bottom-0 flex flex-col text-xs">
            {(() => {
              const sortedPositions = [...slicePositions, footerPosition].sort((a, b) => a - b);
              const regions: { start: number; end: number; label: string }[] = [];
              let lastEnd = 0;
              sortedPositions.forEach((pos, i) => {
                if (pos <= footerPosition) {
                  regions.push({ start: lastEnd, end: pos, label: `${i + 1}` });
                  lastEnd = pos;
                }
              });
              return regions.map((region, i) => (
                <div
                  key={i}
                  className="absolute bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-muted-foreground border"
                  style={{
                    top: `${(region.start + region.end) / 2}%`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  {region.label}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {hasChanges && (
        <p className="text-xs text-muted-foreground text-center">
          Slice positions changed. Click "Re-Process Slices" to update.
        </p>
      )}
    </div>
  );
}
