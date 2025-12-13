import { cn } from '@/lib/utils';
import type { EmailBlock } from '@/types/email-blocks';

interface BlockOverlayProps {
  blocks: EmailBlock[];
  selectedBlockId: string | null;
  onBlockSelect: (blockId: string) => void;
  containerWidth: number;
  containerHeight: number;
  originalWidth: number;
  originalHeight: number;
}

export const BlockOverlay = ({
  blocks,
  selectedBlockId,
  onBlockSelect,
  containerWidth,
  containerHeight,
  originalWidth,
  originalHeight,
}: BlockOverlayProps) => {
  const scaleX = containerWidth / originalWidth;
  const scaleY = containerHeight / originalHeight;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {blocks.map((block) => {
        const isSelected = selectedBlockId === block.id;
        const isImage = block.type === 'image';
        const isFooter = (block as any).isFooter;
        
        // Color based on type: RED for image, BLUE for code, PURPLE for footer
        const colorClasses = isFooter
          ? 'bg-purple-500/20 border-purple-500 hover:bg-purple-500/30'
          : isImage
            ? 'bg-red-500/20 border-red-500 hover:bg-red-500/30'
            : 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30';
        
        const selectedClasses = isFooter
          ? 'ring-2 ring-offset-2 ring-purple-500 border-purple-500 bg-purple-500/25'
          : isImage
            ? 'ring-2 ring-offset-2 ring-red-500 border-red-500 bg-red-500/25'
            : 'ring-2 ring-offset-2 ring-blue-500 border-blue-500 bg-blue-500/25';

        const labelBg = isFooter
          ? 'bg-purple-600'
          : isImage
            ? 'bg-red-600'
            : 'bg-blue-600';

        const scaledHeight = block.bounds.height * scaleY;
        const labelPosition = scaledHeight > 40 ? 'top-2 left-2' : '-top-6 left-0';
        
        return (
          <div
            key={block.id}
            onClick={() => onBlockSelect(block.id)}
            className={cn(
              'absolute border-2 transition-all duration-150 pointer-events-auto cursor-pointer',
              colorClasses,
              isSelected && selectedClasses
            )}
            style={{
              left: block.bounds.x * scaleX,
              top: block.bounds.y * scaleY,
              width: block.bounds.width * scaleX,
              height: scaledHeight,
            }}
          >
            <div className={cn(
              'absolute px-2 py-0.5 text-xs font-medium rounded text-white whitespace-nowrap z-10',
              labelBg,
              labelPosition
            )}>
              {block.name}
              <span className="ml-1.5 opacity-75">
                {isFooter ? '• Footer' : isImage ? '• Image' : '• Code'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
