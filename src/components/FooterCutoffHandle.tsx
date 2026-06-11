import { useCallback, useRef } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cutoffClasses } from '@/lib/statusColors';

interface FooterCutoffHandleProps {
  position: number; // 0-100 percentage
  containerHeight: number;
  onPositionChange: (position: number) => void;
  onReset: () => void;
}

export function FooterCutoffHandle({ 
  position, 
  containerHeight, 
  onPositionChange,
  onReset 
}: FooterCutoffHandleProps) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startPosition = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startPosition.current = position;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      
      const deltaY = moveEvent.clientY - startY.current;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPosition = Math.max(10, Math.min(100, startPosition.current + deltaPercent));
      onPositionChange(newPosition);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, containerHeight, onPositionChange]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onReset();
  }, [onReset]);

  // Don't render if at 100% (no cutoff)
  const isActive = position < 100;

  return (
    <>
      {/* Cutoff line */}
      <div
        className={cn(
          "absolute left-0 right-0 z-20 group cursor-ns-resize",
          isActive ? "opacity-100" : "opacity-0 hover:opacity-60"
        )}
        style={{ top: `${position}%`, transform: 'translateY(-50%)' }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dashed line */}
        <div className={cn(
          "absolute left-0 right-0 h-0.5 border-t-2 border-dashed",
          isActive ? cutoffClasses.lineActive : cutoffClasses.lineInactive
        )} />

        {/* Handle */}
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-all",
          isActive ? cutoffClasses.handleActive : cutoffClasses.handleInactive
        )}>
          <Scissors className="w-3 h-3" />
          <span>{isActive ? 'Footer cutoff' : 'Drag up to exclude footer'}</span>
        </div>
      </div>

      {/* Exclusion zone overlay */}
      {isActive && (
        <div
          className={cn("absolute left-0 right-0 bottom-0 pointer-events-none z-10", cutoffClasses.zone)}
          style={{ height: `${100 - position}%` }}
        >
          <div className={cn("absolute inset-0", cutoffClasses.zoneStripes)} />
          <div className={cn(
            "absolute top-2 left-1/2 -translate-x-1/2 text-xs font-medium px-2 py-0.5 rounded",
            cutoffClasses.zoneLabel
          )}>
            Excluded from slices
          </div>
        </div>
      )}

      {/* Bottom grab zone when at 100% */}
      {!isActive && (
        <div
          className="absolute left-0 right-0 bottom-0 h-8 cursor-ns-resize z-20 group"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Start dragging from bottom
            isDragging.current = true;
            startY.current = e.clientY;
            startPosition.current = 100;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              if (!isDragging.current) return;
              const deltaY = moveEvent.clientY - startY.current;
              const deltaPercent = (deltaY / containerHeight) * 100;
              const newPosition = Math.max(10, Math.min(100, 100 + deltaPercent));
              onPositionChange(newPosition);
            };

            const handleMouseUp = () => {
              isDragging.current = false;
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn("absolute bottom-0 left-0 right-0 h-1 transition-colors", cutoffClasses.grabZone)} />
        </div>
      )}
    </>
  );
}
