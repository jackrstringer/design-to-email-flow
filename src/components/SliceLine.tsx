import { useRef, useCallback, useState } from 'react';
import { X, Square, Columns2, Columns3, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SliceLineProps {
  position: number; // 0-100 percentage
  containerHeight: number;
  onPositionChange: (newPosition: number) => void;
  onDelete: () => void;
  index: number;
  columns: 1 | 2 | 3 | 4;
  onColumnsChange: (columns: 1 | 2 | 3 | 4) => void;
}

const ColumnIcon = ({ cols }: { cols: 1 | 2 | 3 | 4 }) => {
  switch (cols) {
    case 1: return <Square className="w-3 h-3" />;
    case 2: return <Columns2 className="w-3 h-3" />;
    case 3: return <Columns3 className="w-3 h-3" />;
    case 4: return <LayoutGrid className="w-3 h-3" />;
  }
};

export function SliceLine({ position, containerHeight, onPositionChange, onDelete, index, columns, onColumnsChange }: SliceLineProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const dragStartY = useRef<number>(0);
  const dragStartPosition = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartPosition.current = position;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - dragStartY.current;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPosition = Math.max(1, Math.min(99, dragStartPosition.current + deltaPercent));
      onPositionChange(newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, containerHeight, onPositionChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    dragStartPosition.current = position;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const deltaY = moveEvent.touches[0].clientY - dragStartY.current;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPosition = Math.max(1, Math.min(99, dragStartPosition.current + deltaPercent));
      onPositionChange(newPosition);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  }, [position, containerHeight, onPositionChange]);

  return (
    <div
      className={cn(
        'absolute left-0 right-0 flex items-center cursor-ns-resize group z-10',
        isDragging && 'z-20'
      )}
      style={{ top: `${position}%`, transform: 'translateY(-50%)' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Line */}
      <div 
        className={cn(
          'absolute left-0 right-0 h-0.5 border-t-2 border-dashed transition-colors',
          isDragging ? 'border-primary' : 'border-destructive'
        )} 
      />
      
      {/* Label + Column selector + Delete button */}
      <div 
        className={cn(
          'absolute left-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all',
          isDragging ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'
        )}
      >
        <span>Slice {index + 1}</span>
        
        {/* Column selector for region BELOW this line */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-0.5 px-1 py-0.5 rounded transition-all ml-1",
                columns > 1 
                  ? "bg-white/30" 
                  : "bg-white/10 hover:bg-white/20"
              )}
              title="Columns for region below"
            >
              <ColumnIcon cols={columns} />
              <span className="text-[10px]">{columns}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-2" 
            align="start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] text-muted-foreground mb-1.5">Region below this slice:</div>
            <div className="flex gap-1">
              {([1, 2, 3, 4] as const).map((num) => (
                <button
                  key={num}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-md transition-all min-w-[40px]",
                    columns === num
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  )}
                  onClick={() => {
                    onColumnsChange(num);
                    setPopoverOpen(false);
                  }}
                >
                  <ColumnIcon cols={num} />
                  <span className="text-[10px]">{num}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 hover:bg-white/20 rounded ml-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Right handle indicator */}
      <div 
        className={cn(
          'absolute right-2 w-4 h-4 rounded-full flex items-center justify-center transition-colors',
          isDragging ? 'bg-primary' : 'bg-destructive'
        )}
      >
        <div className="w-2 h-0.5 bg-white rounded" />
      </div>
    </div>
  );
}
