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
  actions: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 200,
  description: 200,
  included: 200,
  excluded: 200,
  actions: 60,
};

const MIN_WIDTHS: ColumnWidths = {
  name: 150,
  description: 150,
  included: 150,
  excluded: 150,
  actions: 60,
};

interface SegmentsTableProps {
  presets: SegmentPreset[];
  loading: boolean;
  klaviyoSegments: KlaviyoSegment[];
  loadingSegments: boolean;
  brandId: string;
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

  const columns: { key: keyof ColumnWidths; label: string; grow?: boolean }[] = [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description', grow: true },
    { key: 'included', label: 'Included Segments', grow: true },
    { key: 'excluded', label: 'Excluded Segments', grow: true },
    { key: 'actions', label: '' },
  ];

  return (
    <div className={`border rounded-lg bg-card overflow-hidden ${resizing ? 'select-none' : ''}`}>
      {/* Header */}
      <div className="flex bg-muted/50 border-b">
        {columns.map((col, idx) => (
          <div
            key={col.key}
            className={`relative flex items-center px-3 py-2 text-sm font-medium text-muted-foreground ${idx > 0 ? 'border-l border-border/50' : ''}`}
            style={{ 
              width: col.grow ? undefined : columnWidths[col.key], 
              minWidth: MIN_WIDTHS[col.key],
              flex: col.grow ? 1 : undefined,
            }}
          >
            {col.label}
            {idx < columns.length - 1 && (
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 transition-colors z-10 -mr-1"
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
