import { useRef, useState, useEffect } from 'react';
import { BlockOverlay } from './BlockOverlay';
import type { EmailBlock } from '@/types/email-blocks';

interface DesignPreviewProps {
  imageUrl: string;
  blocks: EmailBlock[];
  selectedBlockId: string | null;
  onBlockSelect: (blockId: string) => void;
  originalWidth: number;
  originalHeight: number;
}

export const DesignPreview = ({
  imageUrl,
  blocks,
  selectedBlockId,
  onBlockSelect,
  originalWidth,
  originalHeight,
}: DesignPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const img = containerRef.current.querySelector('img');
        if (img) {
          setDimensions({
            width: img.clientWidth,
            height: img.clientHeight,
          });
        }
      }
    };

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex-1 bg-muted/30 rounded-xl p-4 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Original Design</h2>
        <span className="text-xs text-muted-foreground">
          {blocks.length} blocks detected
        </span>
      </div>
      
      <div ref={containerRef} className="relative inline-block">
        <img
          src={imageUrl}
          alt="Uploaded email design"
          className="max-w-full h-auto rounded-lg shadow-sm"
          onLoad={() => {
            if (containerRef.current) {
              const img = containerRef.current.querySelector('img');
              if (img) {
                setDimensions({
                  width: img.clientWidth,
                  height: img.clientHeight,
                });
              }
            }
          }}
        />
        
        {dimensions.width > 0 && (
          <BlockOverlay
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onBlockSelect={onBlockSelect}
            containerWidth={dimensions.width}
            containerHeight={dimensions.height}
            originalWidth={originalWidth}
            originalHeight={originalHeight}
          />
        )}
      </div>
    </div>
  );
};
