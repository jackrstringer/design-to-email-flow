import { useRef, useState, useEffect, useLayoutEffect } from 'react';
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
    // Double RAF ensures layout is complete before measuring
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (imageRef.current) {
          console.log('=== CRITICAL DEBUG ===');
          console.log('Props originalWidth:', originalWidth);
          console.log('Props originalHeight:', originalHeight);
          console.log('Image naturalWidth:', imageRef.current.naturalWidth);
          console.log('Image naturalHeight:', imageRef.current.naturalHeight);
          console.log('Image clientWidth:', imageRef.current.clientWidth);
          console.log('Image clientHeight:', imageRef.current.clientHeight);
          console.log('Aspect ratio (props):', originalWidth / originalHeight);
          console.log('Aspect ratio (natural):', imageRef.current.naturalWidth / imageRef.current.naturalHeight);
          console.log('Aspect ratio (client):', imageRef.current.clientWidth / imageRef.current.clientHeight);
          
          // THIS IS THE KEY CHECK:
          if (originalWidth !== imageRef.current.naturalWidth || 
              originalHeight !== imageRef.current.naturalHeight) {
            console.error('!!! MISMATCH: Props do not match actual image dimensions !!!');
          }
          
          setDimensions({
            width: imageRef.current.clientWidth,
            height: imageRef.current.clientHeight,
          });
        }
      });
    });
  };

  // Observe the image directly for resize changes
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const observer = new ResizeObserver(() => updateDimensions());
    observer.observe(img);
    return () => observer.disconnect();
  }, []);

  // Handle cached images - useLayoutEffect prevents flash
  useLayoutEffect(() => {
    if (imageRef.current?.complete && imageRef.current?.naturalWidth > 0) {
      updateDimensions();
    }
  }, [imageUrl]);

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
      
      <div ref={containerRef} className="relative inline-block leading-[0]">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Uploaded email design"
          className="max-w-full h-auto block"
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
