import { useState, useRef, useCallback, useEffect } from 'react';
import { SliceLine } from './SliceLine';
import { FooterCutoffHandle } from './FooterCutoffHandle';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Scissors, RotateCcw, ChevronRight, Image, Code, ZoomIn, ZoomOut, Columns2, Columns3, Square, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SliceType } from '@/types/slice';
import type { ColumnConfig } from '@/lib/imageSlicing';

interface SlicePosition {
  position: number;
  type: SliceType;
  columns: 1 | 2 | 3 | 4;
}

interface SliceEditorProps {
  imageDataUrl: string;
  onProcess: (slicePositions: number[], sliceTypes: SliceType[], columnConfigs: ColumnConfig[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function SliceEditor({ imageDataUrl, onProcess, onCancel, isProcessing }: SliceEditorProps) {
  const [slicePositions, setSlicePositions] = useState<SlicePosition[]>([]);
  const [footerCutoff, setFooterCutoff] = useState(100); // 100 = no cutoff
  const [containerHeight, setContainerHeight] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(35); // Default 35% zoom
  const [activeColumnPopover, setActiveColumnPopover] = useState<number | null>(null);
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
    
    // Only prevent exact duplicates (within 0.5%)
    const tooClose = slicePositions.some(sp => Math.abs(sp.position - percentage) < 0.5);
    if (tooClose) return;
    
    // Add new slice position with default type 'image' and 1 column
    setSlicePositions(prev => 
      [...prev, { position: percentage, type: 'image' as SliceType, columns: 1 as const }]
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

  const updateColumns = useCallback((regionIndex: number, columns: 1 | 2 | 3 | 4) => {
    // regionIndex refers to the region between slice lines
    // Region 0 is above the first slice line, Region 1 is between first and second, etc.
    // We need to map this to the slice positions array
    // The columns setting goes on the slice line that STARTS the region
    // So region 0's columns are stored on a virtual "start" (we'll handle this separately)
    // For regions after slice lines, we store on the previous slice position
    
    setSlicePositions(prev => {
      if (regionIndex === 0) {
        // First region (above first slice) - we need to track this separately
        // We'll use the first slice position to inherit this
        // Actually, let's add a special handling: store columns on regions, not lines
        // Simpler approach: return new array with updated columns for the preceding slice
        return prev; // Will handle with separate state
      }
      const updated = [...prev];
      // regionIndex - 1 because region 0 is above first slice
      if (updated[regionIndex - 1]) {
        updated[regionIndex - 1] = { ...updated[regionIndex - 1], columns };
      }
      return updated;
    });
  }, []);

  // Separate state for first region columns (above first slice line)
  const [firstRegionColumns, setFirstRegionColumns] = useState<1 | 2 | 3 | 4>(1);

  const getRegionColumns = (regionIndex: number): 1 | 2 | 3 | 4 => {
    if (regionIndex === 0) return firstRegionColumns;
    const sliceIndex = regionIndex - 1;
    return slicePositions[sliceIndex]?.columns || 1;
  };

  const setRegionColumns = (regionIndex: number, columns: 1 | 2 | 3 | 4) => {
    if (regionIndex === 0) {
      setFirstRegionColumns(columns);
    } else {
      setSlicePositions(prev => {
        const updated = [...prev];
        const sliceIndex = regionIndex - 1;
        if (updated[sliceIndex]) {
          updated[sliceIndex] = { ...updated[sliceIndex], columns };
        }
        return updated;
      });
    }
    setActiveColumnPopover(null);
  };

  const resetSlices = useCallback(() => {
    setSlicePositions([]);
    setFooterCutoff(100);
    setFirstRegionColumns(1);
  }, []);

  const handleProcess = () => {
    // Filter out any slice positions that fall at or below the footer cutoff
    const validSlicePositions = slicePositions.filter(sp => sp.position < footerCutoff);
    
    // Build positions array using footerCutoff as the end boundary
    const positions = [0, ...validSlicePositions.map(sp => sp.position), footerCutoff];
    
    // Build slice types array - one type per slice
    const sliceCount = validSlicePositions.length + 1;
    const types: SliceType[] = Array(sliceCount).fill('image');
    
    // Build column configs - first region uses firstRegionColumns, rest use slice position columns
    const columnConfigs: ColumnConfig[] = [];
    columnConfigs.push({ columns: firstRegionColumns });
    for (const sp of validSlicePositions) {
      columnConfigs.push({ columns: sp.columns });
    }
    
    onProcess(positions, types, columnConfigs);
  };

  // Calculate slice count based on valid slices (above footer cutoff)
  const validSlicePositions = slicePositions.filter(sp => sp.position < footerCutoff);
  const sliceCount = validSlicePositions.length + 1;

  // Calculate regions for column overlay
  const getRegions = () => {
    const regions: { startPercent: number; endPercent: number; index: number }[] = [];
    const sortedPositions = [0, ...validSlicePositions.map(sp => sp.position), footerCutoff];
    
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      regions.push({
        startPercent: sortedPositions[i],
        endPercent: sortedPositions[i + 1],
        index: i
      });
    }
    return regions;
  };

  const regions = getRegions();

  const ColumnIcon = ({ cols }: { cols: 1 | 2 | 3 | 4 }) => {
    switch (cols) {
      case 1: return <Square className="w-4 h-4" />;
      case 2: return <Columns2 className="w-4 h-4" />;
      case 3: return <Columns3 className="w-4 h-4" />;
      case 4: return <LayoutGrid className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3 shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Define Slice Points</h3>
          <p className="text-sm text-muted-foreground">
            Click to add slice lines. Click region badge to set columns.
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
          className="flex-1 overflow-auto rounded-lg border border-border bg-muted/30 scrollbar-hide"
        >
          <div className="flex justify-center p-4">
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

            {/* First region column selector (above first slice) */}
            <div className="absolute top-2 left-2 z-10">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                      "bg-background/90 backdrop-blur-sm border shadow-sm",
                      firstRegionColumns > 1 
                        ? "border-primary text-primary" 
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    <ColumnIcon cols={firstRegionColumns} />
                    <span>Top: {firstRegionColumns} col{firstRegionColumns > 1 ? 's' : ''}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-auto p-2" 
                  align="start"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] text-muted-foreground mb-1.5">First region columns:</div>
                  <div className="flex gap-1">
                    {([1, 2, 3, 4] as const).map((num) => (
                      <button
                        key={num}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-md transition-all min-w-[40px]",
                          firstRegionColumns === num
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted text-foreground"
                        )}
                        onClick={() => setFirstRegionColumns(num)}
                      >
                        <ColumnIcon cols={num} />
                        <span className="text-[10px]">{num}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          
            {/* Slice lines with integrated column selectors */}
            {slicePositions.map((sp, index) => (
              <SliceLine
                key={index}
                position={sp.position}
                containerHeight={containerHeight}
                onPositionChange={(newPos) => updatePosition(index, newPos)}
                onDelete={() => deletePosition(index)}
                index={index}
                columns={sp.columns}
                onColumnsChange={(cols) => {
                  setSlicePositions(prev => {
                    const updated = [...prev];
                    updated[index] = { ...updated[index], columns: cols };
                    return updated;
                  });
                }}
              />
            ))}

            {/* Footer cutoff handle */}
            <FooterCutoffHandle
              position={footerCutoff}
              containerHeight={containerHeight}
              onPositionChange={setFooterCutoff}
              onReset={() => setFooterCutoff(100)}
            />

            {/* Visual column preview lines for each region */}
            {regions.map((region) => {
              const cols = getRegionColumns(region.index);
              if (cols <= 1) return null;
              
              return (
                <div
                  key={`region-cols-${region.index}`}
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: `${region.startPercent}%`,
                    height: `${region.endPercent - region.startPercent}%`,
                  }}
                >
                  {Array.from({ length: cols - 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l-2 border-dashed border-primary/40"
                      style={{ left: `${((i + 1) / cols) * 100}%` }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Right side: Slice count and reset */}
        <div className="flex flex-col items-center gap-3 py-4 min-w-[80px] shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{sliceCount}</div>
            <div className="text-xs text-muted-foreground">slice{sliceCount !== 1 ? 's' : ''}</div>
          </div>
          
          {(slicePositions.length > 0 || footerCutoff < 100 || firstRegionColumns > 1) && (
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
            <div className="flex items-center gap-1 pt-2 border-t border-border">
              <Columns2 className="w-3 h-3 shrink-0" />
              <span>Columns</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
