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

const blockColors: Record<string, string> = {
  header: 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30',
  hero: 'bg-purple-500/20 border-purple-500 hover:bg-purple-500/30',
  product: 'bg-green-500/20 border-green-500 hover:bg-green-500/30',
  cta: 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30',
  footer: 'bg-gray-500/20 border-gray-500 hover:bg-gray-500/30',
  default: 'bg-primary/20 border-primary hover:bg-primary/30',
};

const getBlockColor = (blockName: string) => {
  const lowerName = blockName.toLowerCase();
  for (const [key, value] of Object.entries(blockColors)) {
    if (lowerName.includes(key)) return value;
  }
  return blockColors.default;
};

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
        const colorClass = getBlockColor(block.name);
        
        return (
          <div
            key={block.id}
            onClick={() => onBlockSelect(block.id)}
            className={cn(
              'absolute border-2 rounded transition-all duration-150 pointer-events-auto cursor-pointer',
              colorClass,
              isSelected && 'ring-2 ring-offset-2 ring-primary border-primary bg-primary/25'
            )}
            style={{
              left: block.bounds.x * scaleX,
              top: block.bounds.y * scaleY,
              width: block.bounds.width * scaleX,
              height: block.bounds.height * scaleY,
            }}
          >
            <div className={cn(
              'absolute left-0 px-2 py-0.5 text-xs font-medium rounded',
              'bg-foreground text-background whitespace-nowrap z-10',
              // Position label at bottom-left inside the block
              'bottom-1 left-1'
            )}>
              {block.name} • {block.type === 'code' ? 'Code' : 'Image'}
            </div>
          </div>
        );
      })}
    </div>
  );
};
