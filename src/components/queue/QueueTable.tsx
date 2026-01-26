import React, { useState, useCallback, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow } from './QueueRow';
import { ExpandedRowPanel } from './ExpandedRowPanel';
import { CampaignQueueItem, SegmentPreset, KlaviyoList, BrandData } from '@/hooks/useCampaignQueue';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Clock } from 'lucide-react';

interface QueueTableProps {
  items: CampaignQueueItem[];
  loading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdate: () => void;
  presetsByBrand: Record<string, SegmentPreset[]>;
  klaviyoListsByBrand: Record<string, KlaviyoList[]>;
  brandDataByBrand: Record<string, BrandData>;
  userZoomLevel: number;
  selectedIds: Set<string>;
  onSelectItem: (id: string, selected: boolean, shiftKey?: boolean) => void;
  onSelectAll: () => void;
}

export interface ColumnWidths {
  status: number;
  thumbnail: number;
  name: number;
  client: number;
  segmentSet: number;
  subject: number;
  previewText: number;
  links: number;
  external: number;
  spelling: number;
  klaviyo: number;
}

// Improved defaults to fill page width better, prioritizing longer content fields
const DEFAULT_WIDTHS: ColumnWidths = {
  status: 150,
  thumbnail: 40,
  name: 220,
  client: 140,
  segmentSet: 180,
  subject: 280,
  previewText: 280,
  links: 60,
  external: 80,
  spelling: 70,
  klaviyo: 180,
};

const MIN_WIDTHS: ColumnWidths = {
  status: 100,
  thumbnail: 40,
  name: 120,
  client: 80,
  segmentSet: 100,
  subject: 150,
  previewText: 150,
  links: 50,
  external: 60,
  spelling: 50,
  klaviyo: 120,
};

export function QueueTable({
  items,
  loading,
  expandedId,
  onToggleExpand,
  onUpdate,
  presetsByBrand,
  klaviyoListsByBrand,
  brandDataByBrand,
  userZoomLevel,
  selectedIds,
  onSelectItem,
  onSelectAll,
}: QueueTableProps) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const [widthsLoaded, setWidthsLoaded] = useState(false);
  const [resizing, setResizing] = useState<keyof ColumnWidths | null>(null);
  
  // Timer visibility state - persisted to localStorage
  const [showTimers, setShowTimers] = useState(() => {
    const stored = localStorage.getItem('queue-show-timers');
    return stored !== 'false'; // Default to visible
  });

  const handleToggleTimers = useCallback(() => {
    setShowTimers(prev => {
      const newValue = !prev;
      localStorage.setItem('queue-show-timers', String(newValue));
      return newValue;
    });
  }, []);

  // Load saved column widths on mount
  useEffect(() => {
    const loadColumnWidths = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setWidthsLoaded(true);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('queue_column_widths')
          .eq('id', user.id)
          .single();

        if (profile?.queue_column_widths && typeof profile.queue_column_widths === 'object') {
          // Merge with defaults to handle any new columns gracefully
          setColumnWidths({ ...DEFAULT_WIDTHS, ...(profile.queue_column_widths as Partial<ColumnWidths>) });
        }
      } catch (error) {
        console.error('Error loading column widths:', error);
      } finally {
        setWidthsLoaded(true);
      }
    };

    loadColumnWidths();
  }, []);

  // Save column widths to database
  const saveColumnWidths = useCallback(async (widths: ColumnWidths) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({ queue_column_widths: widths as unknown as Record<string, number> })
        .eq('id', user.id);
    } catch (error) {
      console.error('Error saving column widths:', error);
    }
  }, []);

  const handleResizeStart = (column: keyof ColumnWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(column);

    const startX = e.clientX;
    const startWidth = columnWidths[column];
    let latestWidths: ColumnWidths = columnWidths;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(MIN_WIDTHS[column], startWidth + delta);
      setColumnWidths(prev => {
        latestWidths = { ...prev, [column]: newWidth };
        return latestWidths;
      });
    };

    const handleMouseUp = () => {
      setResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Save the column widths when resize is complete
      saveColumnWidths(latestWidths);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someSelected = items.some(item => selectedIds.has(item.id));

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex h-8 items-center bg-white border-b border-gray-200 text-[13px] text-gray-500 font-normal">
          <div className="w-8 flex-shrink-0 px-2" />
          <div className="px-2" style={{ width: 100 }}>Status</div>
          <div className="px-2" style={{ width: 40 }} />
          <div className="px-2" style={{ width: 180 }}>Name</div>
          <div className="px-2" style={{ width: 120 }}>Client</div>
          <div className="px-2" style={{ width: 130 }}>Segment Set</div>
          <div className="px-2 flex-1" style={{ minWidth: 200 }}>Subject Line</div>
          <div className="px-2 flex-1" style={{ minWidth: 200 }}>Preview Text</div>
          <div className="px-2 text-center" style={{ width: 60 }}>Links</div>
          <div className="px-2 text-center" style={{ width: 60 }}>External</div>
          <div className="px-2 text-center" style={{ width: 60 }}>Spelling</div>
        </div>
        {/* Skeleton rows */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex h-10 items-center border-b border-gray-100">
            <div className="w-8 flex-shrink-0 px-2"><Skeleton className="h-4 w-4" /></div>
            <div className="px-2" style={{ width: 100 }}><Skeleton className="h-5 w-14" /></div>
            <div className="px-2" style={{ width: 40 }}><Skeleton className="h-8 w-6" /></div>
            <div className="px-2" style={{ width: 180 }}><Skeleton className="h-4 w-28" /></div>
            <div className="px-2" style={{ width: 120 }}><Skeleton className="h-4 w-20" /></div>
            <div className="px-2" style={{ width: 130 }}><Skeleton className="h-4 w-20" /></div>
            <div className="px-2 flex-1"><Skeleton className="h-4 w-36" /></div>
            <div className="px-2 flex-1"><Skeleton className="h-4 w-36" /></div>
            <div className="px-2" style={{ width: 60 }}><Skeleton className="h-4 w-6 mx-auto" /></div>
            <div className="px-2" style={{ width: 60 }}><Skeleton className="h-4 w-4 mx-auto" /></div>
            <div className="px-2" style={{ width: 60 }}><Skeleton className="h-4 w-4 mx-auto" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border border-gray-200 rounded p-12 text-center">
        <p className="text-gray-500 text-sm">No campaigns in queue</p>
        <p className="text-gray-400 text-xs mt-1">
          Upload a campaign or send one from Figma to get started
        </p>
      </div>
    );
  }

  // Calculate minimum table width based on all column widths
  const minTableWidth = Object.values(columnWidths).reduce((sum, w) => sum + w, 0) + 32; // +32 for checkbox column

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ minWidth: `${minTableWidth}px` }}>
      {/* Header - Airtable style */}
      <div 
        className="flex h-8 items-center bg-white border-b border-gray-200 select-none"
        style={{ cursor: resizing ? 'col-resize' : 'default' }}
      >
        {/* Checkbox column */}
        <div className="w-8 flex-shrink-0 px-2 flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onSelectAll}
            className={cn(
              "transition-opacity",
              someSelected || allSelected ? "opacity-100" : "opacity-0 hover:opacity-100"
            )}
          />
        </div>

        {/* Timer column header */}
        <div 
          className="w-14 flex-shrink-0 px-1 flex items-center justify-center cursor-pointer"
          onClick={handleToggleTimers}
          title={showTimers ? "Click to hide timers" : "Click to show timers"}
        >
          <Clock className={cn("h-3 w-3", showTimers ? "text-gray-400" : "text-gray-300")} />
        </div>

        {/* Status */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.status }}
        >
          Status
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('status')}
          />
        </div>

        {/* Thumbnail */}
        <div 
          className="relative flex items-center px-2 flex-shrink-0"
          style={{ width: columnWidths.thumbnail }}
        >
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('thumbnail')}
          />
        </div>

        {/* Name */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.name }}
        >
          Name
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('name')}
          />
        </div>

        {/* Client */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.client }}
        >
          Client
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('client')}
          />
        </div>

        {/* Segment Set */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.segmentSet }}
        >
          Segment Set
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('segmentSet')}
          />
        </div>

        {/* Subject Line */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.subject }}
        >
          Subject Line
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('subject')}
          />
        </div>

        {/* Preview Text */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.previewText }}
        >
          Preview Text
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('previewText')}
          />
        </div>

        {/* Links */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.links }}
        >
          Links
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('links')}
          />
        </div>

        {/* External Links */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.external }}
        >
          Ext. Links
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('external')}
          />
        </div>

        {/* Spelling */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.spelling }}
        >
          Spelling
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-gray-200"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('spelling')}
          />
        </div>

        {/* Klaviyo */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-gray-500 font-normal flex-shrink-0"
          style={{ width: columnWidths.klaviyo }}
        >
          Klaviyo
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-blue-500/20"
            )}
            onMouseDown={handleResizeStart('klaviyo')}
          />
        </div>
      </div>

      <div>
        {items.map((item) => {
          const presets = item.brand_id ? (presetsByBrand[item.brand_id] || []) : [];
          const klaviyoLists = item.brand_id ? (klaviyoListsByBrand[item.brand_id] || []) : [];
          const brandData = item.brand_id ? brandDataByBrand[item.brand_id] : undefined;
          return (
            <React.Fragment key={item.id}>
              <QueueRow
                item={item}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => onToggleExpand(item.id)}
                onUpdate={onUpdate}
                columnWidths={columnWidths}
                presets={presets}
                isSelected={selectedIds.has(item.id)}
                onSelect={onSelectItem}
                showTimers={showTimers}
                onToggleTimers={handleToggleTimers}
              />
              {expandedId === item.id && (
                <ExpandedRowPanel
                  key={item.id}
                  item={item}
                  onUpdate={onUpdate}
                  onClose={() => onToggleExpand(item.id)}
                  preloadedPresets={presets}
                  preloadedKlaviyoLists={klaviyoLists}
                  preloadedBrandData={brandData}
                  initialZoomLevel={userZoomLevel}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
