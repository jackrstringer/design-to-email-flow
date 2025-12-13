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
  const imageRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const updateDimensions = () => {
    if (imageRef.current) {
      const { clientWidth, clientHeight } = imageRef.current;
      console.log('Image dimensions - client:', clientWidth, clientHeight, 'original:', originalWidth, originalHeight);
      setDimensions({
        width: clientWidth,
        height: clientHeight,
      });
    }
  };

  useEffect(() => {
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const imageCount = blocks.filter(b => b.type === 'image').length;
  const codeCount = blocks.filter(b => b.type === 'code').length;

  return (
    <div className="flex-1 bg-muted/30 rounded-xl p-4 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Original Design</h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500"></span>
            Image ({imageCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>
            Code ({codeCount})
          </span>
        </div>
      </div>
      
      <div ref={containerRef} className="relative inline-block">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Uploaded email design"
          className="max-w-full h-auto rounded-lg shadow-sm"
          onLoad={updateDimensions}
        />
        
        {dimensions.width > 0 && dimensions.height > 0 && (
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
