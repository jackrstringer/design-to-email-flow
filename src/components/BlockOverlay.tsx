import { cn } from '@/lib/utils';
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
  
  console.log('=== OVERLAY ===');
  console.log('Scale:', scale);
  console.log('Container:', containerWidth, '×', containerHeight);
  
  blocks.forEach(b => {
    const scaledY = b.bounds.y * scale;
    const scaledH = b.bounds.height * scale;
    console.log(`${b.name}: y=${b.bounds.y}→${scaledY.toFixed(0)}, h=${b.bounds.height}→${scaledH.toFixed(0)}`);
  });

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
        
        // Scale ALL coordinates by the same factor
        const left = block.bounds.x * scale;
        const top = block.bounds.y * scale;
        const width = block.bounds.width * scale;
        const height = block.bounds.height * scale;
        
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

        const labelBg = isFooter ? 'bg-purple-600' : isImage ? 'bg-red-600' : 'bg-blue-600';
        // Always position label inside the block to prevent escaping container
        const labelPosition = 'top-1 left-1';
        
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
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
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
