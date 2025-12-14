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

// Simplified, "always correct" overlay system:
// - Render the image at the exact pixel dimensions used for analysis
// - Overlay uses the same fixed coordinate space (no runtime measurement)
// This guarantees perfect alignment regardless of layout/resizing quirks.
export const DesignPreview = ({
  imageUrl,
  blocks,
  selectedBlockId,
  onBlockSelect,
  analyzedWidth,
  analyzedHeight,
}: DesignPreviewProps) => {
  const imageCount = blocks.filter((b) => b.type === 'image').length;
  const codeCount = blocks.filter((b) => b.type === 'code').length;

  // Coordinate system is exactly the analysis size
  const containerWidth = analyzedWidth || 0;
  const containerHeight = analyzedHeight || 0;

  return (
    <div className="flex-1 bg-muted/30 rounded-xl p-4 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">Original Design</h2>
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

      {/*
        CRITICAL: We lock the image and overlay to the exact analysis dimensions.
        - Outer div scrolls if this is larger than the viewport
        - Inner div is the fixed coordinate space for both image and overlay
      */}
      <div className="inline-block relative" style={{ width: containerWidth, height: containerHeight, lineHeight: 0 }}>
        <img
          src={imageUrl}
          alt="Email design"
          // Force the rendered size to exactly match the analysis coordinate space
          style={{ width: containerWidth, height: containerHeight, display: 'block' }}
        />

        {containerWidth > 0 && containerHeight > 0 && (
          <BlockOverlay
            blocks={blocks}
            scale={1}
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
