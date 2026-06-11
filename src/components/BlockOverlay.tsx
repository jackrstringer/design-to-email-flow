import { cn } from '@/lib/utils';
import { blockOverlayClasses, type BlockKind } from '@/lib/statusColors';
import type { EmailBlock } from '@/types/email-blocks';

interface BlockOverlayProps {
  blocks: EmailBlock[];
  scale: number; // rendered_size / analyzed_size
  containerWidth: number;
  containerHeight: number;
  selectedBlockId: string | null;
  onBlockSelect: (blockId: string) => void;
}

export const BlockOverlay = ({
  blocks,
  scale,
  containerWidth,
  containerHeight,
  selectedBlockId,
  onBlockSelect,
}: BlockOverlayProps) => {
  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{
        width: containerWidth,
        height: containerHeight,
      }}
    >
      {blocks.map((block) => {
        const isSelected = selectedBlockId === block.id;
        const isImage = block.type === 'image';
        const isFooter = (block as any).isFooter;
        const kind: BlockKind = isFooter ? 'footer' : isImage ? 'image' : 'code';
        const overlay = blockOverlayClasses[kind];

        // Scale ALL coordinates by the same factor
        const left = block.bounds.x * scale;
        const top = block.bounds.y * scale;
        const width = block.bounds.width * scale;
        const height = block.bounds.height * scale;

        return (
          <div
            key={block.id}
            onClick={() => onBlockSelect(block.id)}
            className={cn(
              'absolute border-2 transition-all duration-150 pointer-events-auto cursor-pointer',
              overlay.base,
              isSelected && overlay.selected
            )}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
          >
            <div
              className={cn(
                'absolute top-1 left-1 px-2 py-0.5 text-xs font-medium rounded text-white whitespace-nowrap z-10',
                overlay.label
              )}
            >
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
