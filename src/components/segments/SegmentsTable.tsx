import { useState } from 'react';
import { Plus, Star, Trash2, Loader2 } from 'lucide-react';
import { SegmentPreset, KlaviyoSegment } from '@/hooks/useSegmentPresets';
import { SegmentRow } from './SegmentRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

  const handleAddNew = async () => {
    if (!newName.trim()) return;

    setIsSaving(true);
    await onCreatePreset({
      brand_id: brandId,
      name: newName.trim(),
      description: null,
      included_segments: [],
      excluded_segments: [],
      is_default: presets.length === 0, // First preset becomes default
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

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[200px]">Name</TableHead>
            <TableHead className="w-[300px]">Description</TableHead>
            <TableHead className="w-[250px]">Included Segments</TableHead>
            <TableHead className="w-[250px]">Excluded Segments</TableHead>
            <TableHead className="w-[60px] text-center">Default</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {presets.map((preset) => (
            <SegmentRow
              key={preset.id}
              preset={preset}
              klaviyoSegments={klaviyoSegments}
              loadingSegments={loadingSegments}
              onUpdate={onUpdatePreset}
              onDelete={onDeletePreset}
            />
          ))}

          {/* Add new row */}
          {isAddingNew ? (
            <TableRow>
              <TableCell>
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
              </TableCell>
              <TableCell colSpan={4}>
                <span className="text-sm text-muted-foreground">
                  Press Enter to create, Esc to cancel
                </span>
              </TableCell>
              <TableCell>
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
              </TableCell>
            </TableRow>
          ) : (
            <TableRow
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setIsAddingNew(true)}
            >
              <TableCell colSpan={6}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  <span>Add new segment set...</span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
