import { useEffect, useRef, useState } from 'react';
import type { EmailBlock } from '@/types/email-blocks';
import { BlockOverlay } from './BlockOverlay';

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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // When the image loads, capture both its natural and rendered dimensions
  const handleImageLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    const img = e.currentTarget;
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    const rendered = { width: img.clientWidth, height: img.clientHeight };

    setNaturalSize(natural);
    setRenderedSize(rendered);

    console.log('DesignPreview image loaded', { natural, rendered, analyzedWidth, analyzedHeight });
  };

  // Keep rendered size in sync with layout changes
  useEffect(() => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const updateRendered = () => {
      setRenderedSize({ width: img.clientWidth, height: img.clientHeight });
    };

    updateRendered();

    const observer = new ResizeObserver(updateRendered);
    observer.observe(img);

    return () => observer.disconnect();
  }, []);

  const scaleX = analyzedWidth ? renderedSize.width / analyzedWidth : 1;
  const scaleY = analyzedHeight ? renderedSize.height / analyzedHeight : 1;
  const scale = analyzedHeight > 0 ? scaleY : 1;

  const containerWidth = renderedSize.width || analyzedWidth || 0;
  const containerHeight = renderedSize.height || analyzedHeight || 0;

  const imageCount = blocks.filter((b) => b.type === 'image').length;
  const codeCount = blocks.filter((b) => b.type === 'code').length;

  return (
    <div className="flex-1 bg-muted/30 rounded-xl p-4 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Original Design</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Analysis: {analyzedWidth}×{analyzedHeight} · Natural: {naturalSize.width}×{naturalSize.height} · Rendered:{' '}
            {renderedSize.width}×{renderedSize.height} · Scale Y: {scale.toFixed(3)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            Image ({imageCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            Code ({codeCount})
          </span>
        </div>
      </div>

      <div className="inline-block relative" style={{ width: containerWidth, height: containerHeight, lineHeight: 0 }}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Email design"
          onLoad={handleImageLoad}
          className="block max-w-full h-auto"
        />

        {containerWidth > 0 && containerHeight > 0 && (
          <BlockOverlay
            blocks={blocks}
            scale={scale}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            selectedBlockId={selectedBlockId}
            onBlockSelect={onBlockSelect}
          />
        )}
      </div>
    </div>
  );
};
