import { useState } from 'react';
import { Trash2, Loader2, Star } from 'lucide-react';
import { SegmentPreset, KlaviyoSegment } from '@/hooks/useSegmentPresets';
import { SegmentChipsEditor } from './SegmentChipsEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface ColumnWidths {
  name: number;
  description: number;
  included: number;
  excluded: number;
  actions: number;
}

interface SegmentRowProps {
  preset: SegmentPreset;
  klaviyoSegments: KlaviyoSegment[];
  loadingSegments: boolean;
  columnWidths: ColumnWidths;
  onUpdate: (id: string, updates: Partial<SegmentPreset>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function SegmentRow({
  preset,
  klaviyoSegments,
  loadingSegments,
  columnWidths,
  onUpdate,
  onDelete,
}: SegmentRowProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [tempName, setTempName] = useState(preset.name);
  const [tempDescription, setTempDescription] = useState(preset.description || '');

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(preset.id);
    setIsDeleting(false);
  };

  const handleNameSave = async () => {
    if (tempName.trim() && tempName !== preset.name) {
      await onUpdate(preset.id, { name: tempName.trim() });
    }
    setEditingName(false);
  };

  const handleDescriptionSave = async () => {
    if (tempDescription !== (preset.description || '')) {
      await onUpdate(preset.id, { description: tempDescription || null });
    }
    setEditingDescription(false);
  };

  const handleSetDefault = async () => {
    if (!preset.is_default) {
      await onUpdate(preset.id, { is_default: true });
    }
  };

  return (
    <div className="flex items-center hover:bg-muted/30 group">
      {/* Name + Star */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ width: columnWidths.name, minWidth: 150 }}>
        {editingName ? (
          <Input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSave();
              if (e.key === 'Escape') {
                setTempName(preset.name);
                setEditingName(false);
              }
            }}
            className="h-7 text-sm flex-1"
            autoFocus
          />
        ) : (
          <>
            <span
              className="text-sm font-medium cursor-pointer hover:text-primary truncate"
              onClick={() => setEditingName(true)}
            >
              {preset.name}
            </span>
            {preset.is_default ? (
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
            ) : (
              <Star 
                className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-yellow-400 hover:fill-yellow-400 cursor-pointer transition-all flex-shrink-0"
                onClick={handleSetDefault}
              />
            )}
          </>
        )}
      </div>

      {/* Description */}
      <div className="px-3 py-2 flex-1" style={{ minWidth: 150 }}>
        {editingDescription ? (
          <Input
            value={tempDescription}
            onChange={(e) => setTempDescription(e.target.value)}
            onBlur={handleDescriptionSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDescriptionSave();
              if (e.key === 'Escape') {
                setTempDescription(preset.description || '');
                setEditingDescription(false);
              }
            }}
            className="h-7 text-sm"
            autoFocus
            placeholder="Add description..."
          />
        ) : (
          <span
            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground truncate block"
            onClick={() => setEditingDescription(true)}
          >
            {preset.description || <span className="italic">Add description...</span>}
          </span>
        )}
      </div>

      {/* Included Segments */}
      <div className="px-3 py-2 overflow-hidden flex-1" style={{ minWidth: 150 }}>
        <SegmentChipsEditor
          selectedSegments={preset.included_segments}
          availableSegments={klaviyoSegments}
          loading={loadingSegments}
          onChange={(segments) => onUpdate(preset.id, { included_segments: segments })}
          placeholder="Add included..."
        />
      </div>

      {/* Excluded Segments */}
      <div className="px-3 py-2 overflow-hidden flex-1" style={{ minWidth: 150 }}>
        <SegmentChipsEditor
          selectedSegments={preset.excluded_segments}
          availableSegments={klaviyoSegments}
          loading={loadingSegments}
          onChange={(segments) => onUpdate(preset.id, { excluded_segments: segments })}
          placeholder="Exclude..."
        />
      </div>

      {/* Actions */}
      <div 
        className="px-3 py-2 flex justify-center" 
        style={{ width: columnWidths.actions, minWidth: 60 }}
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
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
      </div>
    </div>
  );
}
