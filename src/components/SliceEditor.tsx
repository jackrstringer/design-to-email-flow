import { useState, useRef, useCallback, useEffect } from 'react';
import { SliceLine } from './SliceLine';
import { FooterCutoffHandle } from './FooterCutoffHandle';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Scissors, RotateCcw, ChevronRight, Image, Code, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SliceType } from '@/types/slice';

interface SlicePosition {
  position: number;
  type: SliceType;
}

interface SliceEditorProps {
  imageDataUrl: string;
  onProcess: (slicePositions: number[], sliceTypes: SliceType[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function SliceEditor({ imageDataUrl, onProcess, onCancel, isProcessing }: SliceEditorProps) {
  const [slicePositions, setSlicePositions] = useState<SlicePosition[]>([]);
  const [footerCutoff, setFooterCutoff] = useState(100); // 100 = no cutoff
  const [containerHeight, setContainerHeight] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(35); // Default 35% zoom
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Trackpad/scroll wheel zoom support
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Pinch-to-zoom on Mac trackpad fires as wheel with ctrlKey
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5; // Zoom out/in by 5%
        setZoomLevel(prev => Math.min(100, Math.max(20, prev + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isProcessing) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentage = (clickY / rect.height) * 100;
    
    // Don't add slices below the footer cutoff
    if (percentage >= footerCutoff) return;
    
    // Don't add if too close to existing line (within 3%)
    const tooClose = slicePositions.some(sp => Math.abs(sp.position - percentage) < 3);
    if (tooClose) return;
    
    // Add new slice position with default type 'image'
    setSlicePositions(prev => 
      [...prev, { position: percentage, type: 'image' as SliceType }]
        .sort((a, b) => a.position - b.position)
    );
  }, [slicePositions, isProcessing, footerCutoff]);

  const updatePosition = useCallback((index: number, newPosition: number) => {
    setSlicePositions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], position: newPosition };
      return updated.sort((a, b) => a.position - b.position);
    });
  }, []);

  const deletePosition = useCallback((index: number) => {
    setSlicePositions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const resetSlices = useCallback(() => {
    setSlicePositions([]);
    setFooterCutoff(100);
  }, []);

  const handleProcess = () => {
    // Filter out any slice positions that fall at or below the footer cutoff
    const validSlicePositions = slicePositions.filter(sp => sp.position < footerCutoff);
    
    // Build positions array using footerCutoff as the end boundary
    const positions = [0, ...validSlicePositions.map(sp => sp.position), footerCutoff];
    
    // Build slice types array - one type per slice
    const sliceCount = validSlicePositions.length + 1;
    const types: SliceType[] = Array(sliceCount).fill('image');
    
    onProcess(positions, types);
  };

  // Calculate slice count based on valid slices (above footer cutoff)
  const validSlicePositions = slicePositions.filter(sp => sp.position < footerCutoff);
  const sliceCount = validSlicePositions.length + 1;

  return (
    <div className="flex flex-col h-full">
      {/* Compact header */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Define Slice Points</h3>
          <p className="text-sm text-muted-foreground">
            Click to add slice lines. Drag up from bottom to exclude footer.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleProcess} disabled={isProcessing}>
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

      {/* Main content: left controls, center image, right controls */}
      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        {/* Left side: Vertical zoom slider */}
        <div className="flex flex-col items-center gap-2 py-4 shrink-0">
          <ZoomIn className="w-4 h-4 text-muted-foreground" />
          <Slider
            value={[zoomLevel]}
            onValueChange={([v]) => setZoomLevel(v)}
            min={20}
            max={100}
            step={5}
            orientation="vertical"
            className="h-32"
          />
          <ZoomOut className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">{zoomLevel}%</span>
          <p className="text-[10px] text-muted-foreground text-center mt-1 max-w-[60px]">
            Ctrl+scroll to zoom
          </p>
        </div>

        {/* Center: Image with slice lines - constrained scroll viewport */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto rounded-lg border border-border bg-muted/30 min-h-0"
        >
          <div className="flex justify-center min-h-full">
          <div 
            ref={containerRef}
            className={cn(
              'relative cursor-crosshair shrink-0',
              isProcessing && 'pointer-events-none opacity-70'
            )}
            style={{ 
              width: `${zoomLevel}%`,
              minWidth: `${zoomLevel}%`,
            }}
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
            {slicePositions.map((sp, index) => (
              <SliceLine
                key={index}
                position={sp.position}
                containerHeight={containerHeight}
                onPositionChange={(newPos) => updatePosition(index, newPos)}
                onDelete={() => deletePosition(index)}
                index={index}
              />
            ))}

            {/* Footer cutoff handle */}
            <FooterCutoffHandle
              position={footerCutoff}
              containerHeight={containerHeight}
              onPositionChange={setFooterCutoff}
              onReset={() => setFooterCutoff(100)}
            />

            {/* Visual slice preview overlay */}
            {slicePositions.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {[0, ...slicePositions.map(sp => sp.position)].map((startPos, i) => {
                  const endPos = slicePositions[i]?.position ?? 100;
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
          </div>
        </div>

        {/* Right side: Slice count and reset */}
        <div className="flex flex-col items-center gap-3 py-4 min-w-[80px] shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{sliceCount}</div>
            <div className="text-xs text-muted-foreground">slice{sliceCount !== 1 ? 's' : ''}</div>
          </div>
          
          {(slicePositions.length > 0 || footerCutoff < 100) && (
            <Button variant="ghost" size="sm" onClick={resetSlices} disabled={isProcessing} className="w-full">
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
          )}

          {/* Legend moved to right side */}
          <div className="mt-auto space-y-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Image className="w-3 h-3 shrink-0" />
              <span>Image</span>
            </div>
            <div className="flex items-center gap-1">
              <Code className="w-3 h-3 shrink-0" />
              <span>HTML</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
