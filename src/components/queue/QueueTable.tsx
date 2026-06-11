import React, { useState, useCallback, useEffect } from 'react';
import { Inbox } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow } from './QueueRow';
import { ExpandedRowPanel } from './ExpandedRowPanel';
import { CampaignQueueItem, SegmentPreset, KlaviyoList, BrandData } from '@/hooks/useCampaignQueue';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
  showTimers: boolean;
  onToggleTimers: () => void;
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
// Sized so the natural sum (~1170 + chrome) fits a laptop viewport with the
// sidebar open at the 13px density — bigger screens stretch to fill.
const DEFAULT_WIDTHS: ColumnWidths = {
  status: 124,
  thumbnail: 36,
  name: 160,
  client: 110,
  segmentSet: 114,
  subject: 184,
  previewText: 184,
  links: 44,
  external: 56,
  spelling: 52,
  klaviyo: 120,
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
  showTimers,
  onToggleTimers,
}: QueueTableProps) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const [widthsLoaded, setWidthsLoaded] = useState(false);
  const [resizing, setResizing] = useState<keyof ColumnWidths | null>(null);

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

        // v2: discard widths saved under the old, wider design.
        if (profile?.queue_column_widths && typeof profile.queue_column_widths === 'object' && (profile.queue_column_widths as Record<string, unknown>).__v === 2) {
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
        .update({ queue_column_widths: { __v: 2, ...widths } as unknown as Record<string, number> })
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

  // Visible width of the scroll viewport — the expanded panel pins to this
  // so horizontal table scrolling never clips the review surface.
  // Callback ref: the wrap mounts/unmounts across loading-skeleton and
  // empty-state renders, so the observer must follow the element itself —
  // an effect keyed on render flags misses the empty→populated transition.
  const [scrollWrapEl, setScrollWrapEl] = useState<HTMLDivElement | null>(null);
  const [visibleWidth, setVisibleWidth] = useState(0);
  useEffect(() => {
    if (!scrollWrapEl) return;
    const update = () => setVisibleWidth(scrollWrapEl.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scrollWrapEl);
    return () => ro.disconnect();
  }, [scrollWrapEl]);

  // Fit-to-viewport column engine: utility columns are fixed, content
  // columns share whatever space remains (proportional to their configured
  // widths, so drag-resize still adjusts shares). The table always sums to
  // the visible width — the queue never forces horizontal scrolling unless
  // the viewport is genuinely too narrow for the floors.
  const FIXED_COLS = ['status', 'thumbnail', 'links', 'external', 'spelling', 'klaviyo'] as const;
  const FLEX_COLS = ['name', 'client', 'segmentSet', 'subject', 'previewText'] as const;
  const CHROME_W = 32 + (showTimers ? 40 : 0); // checkbox + optional timer column

  const fitted = React.useMemo(() => {
    const w: ColumnWidths = { ...columnWidths };
    if (!visibleWidth) return w;
    const fixedSum = FIXED_COLS.reduce((sum, c) => sum + w[c], 0) + CHROME_W + 24;
    const flexSum = FLEX_COLS.reduce((sum, c) => sum + w[c], 0);
    const avail = visibleWidth - fixedSum;
    // Stretch-to-fill only: when there's spare room, content columns grow to
    // use it. When there isn't, columns KEEP their comfortable widths and the
    // rows scroll sideways inside the table (Airtable-style) — the user can
    // widen columns past the viewport freely. Only the page never scrolls.
    // allow an invisible squeeze (≤5%) rather than a pointless scrollbar
    if (flexSum <= 0 || avail <= 0 || avail < flexSum * 0.95) return w;
    const k = avail / flexSum;
    const FLEX_FLOOR = 90;
    let used = 0;
    FLEX_COLS.forEach((c) => {
      w[c] = Math.max(FLEX_FLOOR, Math.floor(w[c] * k));
      used += w[c];
    });
    // Hand the rounding remainder to the subject column so the row sums to
    // EXACTLY the available width — no phantom scrollbar.
    w.subject += Math.max(0, avail - used);
    return w;
  }, [columnWidths, visibleWidth, showTimers]);

  const minTableWidth = Object.values(fitted).reduce((sum, w) => sum + w, 0) + CHROME_W;

  if (loading) {
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex h-8 items-center bg-card border-b border-border text-[13px] text-muted-foreground font-normal">
          <div className="w-8 flex-shrink-0 px-2" />
          {showTimers && <div className="w-10 flex-shrink-0" />} {/* Timer column */}
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
          <div key={i} className="flex h-10 items-center border-b border-border/60">
            <div className="w-8 flex-shrink-0 px-2"><Skeleton className="h-4 w-4" /></div>
            {showTimers && <div className="w-10 flex-shrink-0" />} {/* Timer column */}
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
      <div className="glow-ember flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/20 bg-gradient-to-b from-brand/10 to-brand/5 shadow-card">
          <Inbox className="h-5 w-5 text-brand" strokeWidth={1.75} />
        </div>
        <p className="font-display mt-5 text-[22px] leading-tight text-foreground">Your queue is clear</p>
        <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground">
          Send a frame from Figma or upload a design — Sendr slices it, QAs it, and builds it in Klaviyo.
        </p>
      </div>
    );
  }


  return (
    <div ref={setScrollWrapEl} className="overflow-x-auto rounded-lg border border-border">
    {/* min-width spacer only — overflow must stay visible here or the
        expanded panel's sticky pinning breaks (sticky needs the scrollable
        ancestor to be the rounded scroll wrap above) */}
    <div style={{ minWidth: `${minTableWidth}px` }}>
      {/* Header - Airtable style */}
      <div 
        className="flex h-8 items-center bg-card border-b border-border select-none"
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

        {/* Timer column — only exists while timers are shown */}
        {showTimers && (
          <div
            className="w-10 flex-shrink-0 flex items-center justify-center cursor-pointer text-[10px] text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTimers();
            }}
          >
            Time
          </div>
        )}

        {/* Status */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.status }}
        >
          Status
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('status')}
          />
        </div>

        {/* Thumbnail */}
        <div 
          className="relative flex items-center px-2 flex-shrink-0"
          style={{ width: fitted.thumbnail }}
        >
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('thumbnail')}
          />
        </div>

        {/* Name */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.name }}
        >
          Name
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('name')}
          />
        </div>

        {/* Client */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.client }}
        >
          Client
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('client')}
          />
        </div>

        {/* Segment Set */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.segmentSet }}
        >
          Segment Set
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('segmentSet')}
          />
        </div>

        {/* Subject Line */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.subject }}
        >
          Subject Line
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('subject')}
          />
        </div>

        {/* Preview Text */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.previewText }}
        >
          Preview Text
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('previewText')}
          />
        </div>

        {/* Links */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.links }}
        >
          Links
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('links')}
          />
        </div>

        {/* External Links */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.external }}
        >
          Ext. Links
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('external')}
          />
        </div>

        {/* Spelling */}
        <div 
          className="relative flex items-center justify-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.spelling }}
        >
          Spelling
          <div 
            className="absolute right-0 top-1 bottom-1 w-px bg-secondary"
          />
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
            )}
            onMouseDown={handleResizeStart('spelling')}
          />
        </div>

        {/* Klaviyo */}
        <div 
          className="relative flex items-center px-2 text-[13px] text-muted-foreground font-normal flex-shrink-0"
          style={{ width: fitted.klaviyo }}
        >
          Klaviyo
          <div 
            className={cn(
              "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize -translate-x-0.5",
              "hover:bg-secondary"
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
          const liveSegmentIds = new Set(klaviyoLists.map((l: any) => l.id));
          const liveSegmentsLoaded = item.brand_id ? item.brand_id in klaviyoListsByBrand : false;
          return (
            <React.Fragment key={item.id}>
              <QueueRow
                item={item}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => onToggleExpand(item.id)}
                onUpdate={onUpdate}
                columnWidths={fitted}
                presets={presets}
                liveSegmentIds={liveSegmentIds}
                liveSegmentsLoaded={liveSegmentsLoaded}
                isSelected={selectedIds.has(item.id)}
                onSelect={onSelectItem}
                showTimers={showTimers}
                onToggleTimers={onToggleTimers}
              />
              {expandedId === item.id && (
                <div className="sticky left-0" style={{ width: visibleWidth ? `${visibleWidth}px` : '100%' }}>
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
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
    </div>
  );
}
