import { useState, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { SegmentPreset, KlaviyoSegment } from '@/hooks/useSegmentPresets';
import { SegmentRow } from './SegmentRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface ColumnWidths {
  name: number;
  description: number;
  included: number;
  excluded: number;
  default: number;
  actions: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 180,
  description: 250,
  included: 220,
  excluded: 220,
  default: 80,
  actions: 60,
};

const MIN_WIDTHS: ColumnWidths = {
  name: 120,
  description: 150,
  included: 150,
  excluded: 150,
  default: 60,
  actions: 60,
};

interface SegmentsTableProps {
  presets: SegmentPreset[];
  loading: boolean;
  klaviyoSegments: KlaviyoSegment[];
  loadingSegments: boolean;
  brandId: string;
  klaviyoApiKey: string | null;
  onCreatePreset: (preset: Omit<SegmentPreset, 'id' | 'created_at' | 'updated_at'>) => Promise<any>;
  onUpdatePreset: (id: string, updates: Partial<SegmentPreset>) => Promise<boolean>;
  onDeletePreset: (id: string) => Promise<boolean>;
}

export function SegmentsTable({
  presets,
  loading,
  klaviyoSegments,
  loadingSegments,
  brandId,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
}: SegmentsTableProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const [resizing, setResizing] = useState<keyof ColumnWidths | null>(null);

  const handleResizeStart = useCallback((column: keyof ColumnWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(column);
    const startX = e.clientX;
    const startWidth = columnWidths[column];

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(MIN_WIDTHS[column], startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths]);

  const handleAddNew = async () => {
    if (!newName.trim()) return;

    setIsSaving(true);
    await onCreatePreset({
      brand_id: brandId,
      name: newName.trim(),
      description: null,
      included_segments: [],
      excluded_segments: [],
      is_default: presets.length === 0,
    });
    setNewName('');
    setIsAddingNew(false);
    setIsSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const columns: { key: keyof ColumnWidths; label: string; align?: 'center' | 'left' | 'right' }[] = [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'included', label: 'Included Segments' },
    { key: 'excluded', label: 'Excluded Segments' },
    { key: 'default', label: 'Default', align: 'center' },
    { key: 'actions', label: '' },
  ];

  return (
    <div className={`border rounded-lg bg-card overflow-hidden ${resizing ? 'select-none' : ''}`}>
      {/* Header */}
      <div className="flex bg-muted/50 border-b">
        {columns.map((col, idx) => (
          <div
            key={col.key}
            className="relative flex items-center px-3 py-2 text-sm font-medium text-muted-foreground"
            style={{ 
              width: columnWidths[col.key], 
              minWidth: MIN_WIDTHS[col.key],
              justifyContent: col.align === 'center' ? 'center' : 'flex-start',
            }}
          >
            {col.label}
            {idx < columns.length - 1 && (
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-10"
                onMouseDown={handleResizeStart(col.key)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="divide-y">
        {presets.map((preset) => (
          <SegmentRow
            key={preset.id}
            preset={preset}
            klaviyoSegments={klaviyoSegments}
            loadingSegments={loadingSegments}
            columnWidths={columnWidths}
            onUpdate={onUpdatePreset}
            onDelete={onDeletePreset}
          />
        ))}

        {/* Add new row */}
        {isAddingNew ? (
          <div className="flex items-center">
            <div className="px-3 py-2" style={{ width: columnWidths.name }}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Segment set name..."
                className="h-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew();
                  if (e.key === 'Escape') {
                    setIsAddingNew(false);
                    setNewName('');
                  }
                }}
              />
            </div>
            <div className="flex-1 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Press Enter to create, Esc to cancel
              </span>
            </div>
            <div className="px-3 py-2" style={{ width: columnWidths.actions }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddNew}
                disabled={!newName.trim() || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted/50"
            onClick={() => setIsAddingNew(true)}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Plus className="h-4 w-4" />
              <span>Add new segment set...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
