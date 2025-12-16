import { useState, useRef, useCallback, useEffect } from 'react';
import { SliceLine } from './SliceLine';
import { Button } from '@/components/ui/button';
import { Scissors, RotateCcw, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SliceEditorProps {
  imageDataUrl: string;
  onProcess: (slicePositions: number[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function SliceEditor({ imageDataUrl, onProcess, onCancel, isProcessing }: SliceEditorProps) {
  const [slicePositions, setSlicePositions] = useState<number[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const updateHeight = () => {
      if (imageRef.current) {
        setContainerHeight(imageRef.current.clientHeight);
      }
    };

    const img = imageRef.current;
    if (img) {
      if (img.complete) {
        updateHeight();
      } else {
        img.onload = updateHeight;
      }
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [imageDataUrl]);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isProcessing) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentage = (clickY / rect.height) * 100;
    
    // Don't add if too close to existing line (within 3%)
    const tooClose = slicePositions.some(pos => Math.abs(pos - percentage) < 3);
    if (tooClose) return;
    
    // Add new slice position
    setSlicePositions(prev => [...prev, percentage].sort((a, b) => a - b));
  }, [slicePositions, isProcessing]);

  const updatePosition = useCallback((index: number, newPosition: number) => {
    setSlicePositions(prev => {
      const updated = [...prev];
      updated[index] = newPosition;
      return updated.sort((a, b) => a - b);
    });
  }, []);

  const deletePosition = useCallback((index: number) => {
    setSlicePositions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const resetSlices = useCallback(() => {
    setSlicePositions([]);
  }, []);

  const handleProcess = () => {
    // Always include 0 and 100 as boundaries
    const positions = [0, ...slicePositions, 100];
    onProcess(positions);
  };

  const sliceCount = slicePositions.length + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Define Slice Points</h3>
          <p className="text-sm text-muted-foreground">
            Click on the image to add slice lines. Drag to adjust, click X to remove.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {sliceCount} slice{sliceCount !== 1 ? 's' : ''}
          </span>
          {slicePositions.length > 0 && (
            <Button variant="ghost" size="sm" onClick={resetSlices} disabled={isProcessing}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Image with slice lines */}
      <div 
        ref={containerRef}
        className={cn(
          'relative cursor-crosshair rounded-lg overflow-hidden border border-border',
          isProcessing && 'pointer-events-none opacity-70'
        )}
        onClick={handleImageClick}
      >
        <img
          ref={imageRef}
          src={imageDataUrl}
          alt="Email to slice"
          className="w-full h-auto block"
          draggable={false}
        />
        
        {/* Slice lines */}
        {slicePositions.map((position, index) => (
          <SliceLine
            key={index}
            position={position}
            containerHeight={containerHeight}
            onPositionChange={(newPos) => updatePosition(index, newPos)}
            onDelete={() => deletePosition(index)}
            index={index}
          />
        ))}

        {/* Visual slice preview overlay */}
        {slicePositions.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {[0, ...slicePositions].map((startPos, i) => {
              const endPos = slicePositions[i] ?? 100;
              return (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-l-4 border-primary/20"
                  style={{
                    top: `${startPos}%`,
                    height: `${endPos - startPos}%`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleProcess} disabled={isProcessing} className="flex-1">
          {isProcessing ? (
            <>Processing...</>
          ) : (
            <>
              <Scissors className="w-4 h-4 mr-2" />
              Process {sliceCount} Slice{sliceCount !== 1 ? 's' : ''}
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
