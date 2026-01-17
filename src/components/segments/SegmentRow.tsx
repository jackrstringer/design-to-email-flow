import { useState } from 'react';
import { Star, Trash2, Loader2 } from 'lucide-react';
import { SegmentPreset, KlaviyoSegment } from '@/hooks/useSegmentPresets';
import { SegmentChipsEditor } from './SegmentChipsEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface SegmentRowProps {
  preset: SegmentPreset;
  klaviyoSegments: KlaviyoSegment[];
  loadingSegments: boolean;
  onUpdate: (id: string, updates: Partial<SegmentPreset>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function SegmentRow({
  preset,
  klaviyoSegments,
  loadingSegments,
  onUpdate,
  onDelete,
}: SegmentRowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingField, setEditingField] = useState<'name' | 'description' | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = (field: 'name' | 'description') => {
    setEditingField(field);
    setEditValue(field === 'name' ? preset.name : preset.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;

    const value = editValue.trim();
    if (editingField === 'name' && !value) return;

    await onUpdate(preset.id, { [editingField]: value || null });
    setEditingField(null);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleToggleDefault = async () => {
    await onUpdate(preset.id, { is_default: !preset.is_default });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(preset.id);
    setIsDeleting(false);
  };

  return (
    <TableRow>
      {/* Name */}
      <TableCell>
        {editingField === 'name' ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-8"
            autoFocus
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
          />
        ) : (
          <div
            className="cursor-pointer hover:bg-muted/50 px-2 py-1 -mx-2 rounded text-sm font-medium"
            onClick={() => handleStartEdit('name')}
          >
            {preset.name}
          </div>
        )}
      </TableCell>

      {/* Description */}
      <TableCell>
        {editingField === 'description' ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-8"
            autoFocus
            onBlur={handleSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
          />
        ) : (
          <div
            className="cursor-pointer hover:bg-muted/50 px-2 py-1 -mx-2 rounded text-sm text-muted-foreground min-h-[28px]"
            onClick={() => handleStartEdit('description')}
          >
            {preset.description || <span className="italic">Add description...</span>}
          </div>
        )}
      </TableCell>

      {/* Included Segments */}
      <TableCell>
        <SegmentChipsEditor
          selectedSegments={preset.included_segments}
          availableSegments={klaviyoSegments}
          loading={loadingSegments}
          onChange={(segments) => onUpdate(preset.id, { included_segments: segments })}
          placeholder="Add included..."
        />
      </TableCell>

      {/* Excluded Segments */}
      <TableCell>
        <SegmentChipsEditor
          selectedSegments={preset.excluded_segments}
          availableSegments={klaviyoSegments}
          loading={loadingSegments}
          onChange={(segments) => onUpdate(preset.id, { excluded_segments: segments })}
          placeholder="Add excluded..."
        />
      </TableCell>

      {/* Default Toggle */}
      <TableCell className="text-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleToggleDefault}
        >
          <Star
            className={cn(
              'h-4 w-4',
              preset.is_default
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground'
            )}
          />
        </Button>
      </TableCell>

      {/* Delete */}
      <TableCell>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Segment Set</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{preset.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
