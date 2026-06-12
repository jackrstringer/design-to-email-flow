import React from 'react';
import { Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow, QueueDensity } from './QueueRow';
import { ExpandedRowPanel } from './ExpandedRowPanel';
import { CampaignQueueItem, SegmentPreset, KlaviyoList, BrandData } from '@/hooks/useCampaignQueue';
import { cn } from '@/lib/utils';

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
  density: QueueDensity;
}

interface Group {
  key: string;
  label: string;
  items: CampaignQueueItem[];
}

/** The queue thinks for you: what needs attention first, then the machine's
 *  work, then what's done. */
function groupItems(items: CampaignQueueItem[]): Group[] {
  const needsReview: CampaignQueueItem[] = [];
  const processing: CampaignQueueItem[] = [];
  const sent: CampaignQueueItem[] = [];
  const closed: CampaignQueueItem[] = [];

  for (const item of items) {
    switch (item.status) {
      case 'processing':
        processing.push(item);
        break;
      case 'sent_to_klaviyo':
        sent.push(item);
        break;
      case 'closed':
        closed.push(item);
        break;
      default:
        // ready_for_review, approved, failed — all want eyes on them
        needsReview.push(item);
    }
  }

  return [
    { key: 'review', label: 'Needs review', items: needsReview },
    { key: 'processing', label: 'Processing', items: processing },
    { key: 'sent', label: 'Built in Klaviyo', items: sent },
    { key: 'closed', label: 'Closed', items: closed },
  ].filter((g) => g.items.length > 0);
}

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
  showTimers,
  onToggleTimers,
  density,
}: QueueTableProps) {
  const compact = density === 'compact';

  if (loading) {
    return (
      <div className={cn('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        <Skeleton className="mb-1 h-3.5 w-28 rounded-full" />
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'flex items-center bg-card',
              compact ? 'h-10 gap-2.5 rounded-xl px-3' : 'h-[74px] gap-3.5 rounded-2xl px-4',
            )}
            style={{ boxShadow: 'hsl(240 6% 90%) 0 1px 0 0 inset' }}
          >
            <Skeleton className={compact ? 'h-7 w-5 rounded-[5px]' : 'h-[54px] w-[42px] rounded-[9px]'} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-44 rounded-full" />
              {!compact && <Skeleton className="h-2.5 w-72 rounded-full" />}
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glow-ember flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-card py-20 text-center shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Inbox className="h-5 w-5 text-foreground/70" strokeWidth={1.75} />
        </div>
        <p className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-foreground">Your queue is clear</p>
        <p className="mt-1.5 max-w-xs text-[12.5px] text-muted-foreground">
          Send a frame from Figma or upload a design — Sendr slices it, QAs it, and builds it in Klaviyo.
        </p>
      </div>
    );
  }

  const groups = groupItems(items);

  return (
    <div className="flex flex-col">
      {groups.map((group, gi) => (
        <section key={group.key}>
          <div className={cn('flex items-baseline gap-2 px-2.5 pb-2', gi === 0 ? 'pt-0.5' : compact ? 'pt-4' : 'pt-5')}>
            <h2 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground">{group.label}</h2>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70">{group.items.length}</span>
            <span className="ml-1 h-px flex-1 self-center bg-border/70" aria-hidden />
          </div>

          <div className={cn('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
            {group.items.map((item) => {
              const presets = item.brand_id ? presetsByBrand[item.brand_id] || [] : [];
              const klaviyoLists = item.brand_id ? klaviyoListsByBrand[item.brand_id] || [] : [];
              const brandData = item.brand_id ? brandDataByBrand[item.brand_id] : undefined;
              const liveSegmentIds = new Set(klaviyoLists.map((l: any) => l.id));
              const liveSegmentsLoaded = item.brand_id ? item.brand_id in klaviyoListsByBrand : false;
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className={cn(isExpanded && 'overflow-hidden rounded-2xl bg-card shadow-card')}>
                  <QueueRow
                    item={item}
                    isExpanded={isExpanded}
                    onToggleExpand={() => onToggleExpand(item.id)}
                    onUpdate={onUpdate}
                    density={density}
                    presets={presets}
                    liveSegmentIds={liveSegmentIds}
                    liveSegmentsLoaded={liveSegmentsLoaded}
                    isSelected={selectedIds.has(item.id)}
                    onSelect={onSelectItem}
                    showTimers={showTimers}
                    onToggleTimers={onToggleTimers}
                  />
                  {isExpanded && (
                    <div className="border-t border-border/60">
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
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
