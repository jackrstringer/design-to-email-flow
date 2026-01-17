import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';

interface SegmentSizes {
  [presetId: string]: { loading: boolean; size: number | null };
}

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
  klaviyoApiKey,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
}: SegmentsTableProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [segmentSizes, setSegmentSizes] = useState<SegmentSizes>({});

  const fetchSegmentSize = useCallback(async (preset: SegmentPreset) => {
    if (!klaviyoApiKey || preset.included_segments.length === 0) {
      setSegmentSizes(prev => ({
        ...prev,
        [preset.id]: { loading: false, size: null }
      }));
      return;
    }

    setSegmentSizes(prev => ({
      ...prev,
      [preset.id]: { loading: true, size: null }
    }));

    try {
      const segmentIds = preset.included_segments.map(s => s.id);
      const { data, error } = await supabase.functions.invoke('get-segment-size', {
        body: { klaviyoApiKey, segmentIds }
      });

      if (error) throw error;

      setSegmentSizes(prev => ({
        ...prev,
        [preset.id]: { loading: false, size: data.totalSize || 0 }
      }));
    } catch (err) {
      console.error('Failed to fetch segment size:', err);
      setSegmentSizes(prev => ({
        ...prev,
        [preset.id]: { loading: false, size: null }
      }));
    }
  }, [klaviyoApiKey]);

  // Fetch sizes for all presets when they change
  useEffect(() => {
    if (!klaviyoApiKey) return;
    
    presets.forEach(preset => {
      // Only fetch if we don't already have the size or if segments changed
      const currentSize = segmentSizes[preset.id];
      if (!currentSize || currentSize.size === null) {
        fetchSegmentSize(preset);
      }
    });
  }, [presets, klaviyoApiKey, fetchSegmentSize]);

  // Refetch size when a preset's segments change
  const handleUpdateWithSizeRefresh = async (id: string, updates: Partial<SegmentPreset>) => {
    const result = await onUpdatePreset(id, updates);
    if (result && (updates.included_segments || updates.excluded_segments)) {
      const preset = presets.find(p => p.id === id);
      if (preset) {
        const updatedPreset = { ...preset, ...updates };
        fetchSegmentSize(updatedPreset as SegmentPreset);
      }
    }
    return result;
  };

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

  const formatSize = (size: number | null): string => {
    if (size === null) return '—';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toString();
  };

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[180px]">Name</TableHead>
            <TableHead className="w-[100px] text-right">Size</TableHead>
            <TableHead className="w-[250px]">Description</TableHead>
            <TableHead className="w-[220px]">Included Segments</TableHead>
            <TableHead className="w-[220px]">Excluded Segments</TableHead>
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
              segmentSize={segmentSizes[preset.id]}
              formatSize={formatSize}
              onUpdate={handleUpdateWithSizeRefresh}
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
              <TableCell colSpan={5}>
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
              <TableCell colSpan={7}>
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
