import { useRef, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SliceLineProps {
  position: number; // 0-100 percentage
  containerHeight: number;
  onPositionChange: (newPosition: number) => void;
  onDelete: () => void;
  index: number;
}

export function SliceLine({ position, containerHeight, onPositionChange, onDelete, index }: SliceLineProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number>(0);
  const dragStartPosition = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
      
      {/* Label + Delete button */}
      <div 
        className={cn(
          'absolute left-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all',
          isDragging ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'
        )}
      >
        <span>Slice {index + 1}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 hover:bg-white/20 rounded"
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
