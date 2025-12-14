import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { BlockOverlay } from './BlockOverlay';
import type { EmailBlock } from '@/types/email-blocks';

interface DesignPreviewProps {
  imageUrl: string;
  blocks: EmailBlock[];
  selectedBlockId: string | null;
  onBlockSelect: (blockId: string) => void;
  analyzedWidth: number;
  analyzedHeight: number;
}

export const DesignPreview = ({
  imageUrl,
  blocks,
  selectedBlockId,
  onBlockSelect,
  analyzedWidth,
  analyzedHeight,
}: DesignPreviewProps) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [rendered, setRendered] = useState({ width: 0, height: 0 });

  // Measure the actual rendered size of the image
  const measure = useCallback(() => {
    if (!imgRef.current) return;
    
    const img = imgRef.current;
    const w = img.clientWidth;
    const h = img.clientHeight;
    
    if (w > 0 && h > 0) {
      console.log('=== IMAGE MEASUREMENT ===');
      console.log('Natural:', img.naturalWidth, '×', img.naturalHeight);
      console.log('Rendered:', w, '×', h);
      console.log('Analyzed at:', analyzedWidth, '×', analyzedHeight);
      
      if (img.naturalWidth !== analyzedWidth || img.naturalHeight !== analyzedHeight) {
        console.warn('Natural dimensions differ from analyzed dimensions');
      }
      
      setRendered({ width: w, height: h });
    }
  }, [analyzedWidth, analyzedHeight]);

  // Double RAF ensures CSS layout is complete before measuring
  const handleLoad = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measure();
      });
    });
  }, [measure]);

  // Handle cached images (already loaded when component mounts)
  useLayoutEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      handleLoad();
    }
  }, [imageUrl, handleLoad]);

  // Re-measure on resize
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    
    const observer = new ResizeObserver(() => measure());
    observer.observe(img);
    return () => observer.disconnect();
  }, [measure]);

  // THE KEY: single scale factor = rendered size / analyzed size
  const scale = rendered.width > 0 ? rendered.width / analyzedWidth : 1;

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
      
      {/* 
        CRITICAL CSS STRUCTURE:
        - inline-block makes container shrink-wrap to image size
        - relative establishes positioning context for overlay
        - line-height: 0 removes gap below image
      */}
      <div className="inline-block relative" style={{ lineHeight: 0 }}>
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Email design"
          onLoad={handleLoad}
          className="block max-w-full h-auto"
        />
        
        {rendered.width > 0 && rendered.height > 0 && (
          <BlockOverlay
            blocks={blocks}
            scale={scale}
            containerWidth={rendered.width}
            containerHeight={rendered.height}
            selectedBlockId={selectedBlockId}
            onBlockSelect={onBlockSelect}
          />
        )}
      </div>
    </div>
  );
};
