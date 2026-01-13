import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow } from './QueueRow';
import { ExpandedRowPanel } from './ExpandedRowPanel';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { cn } from '@/lib/utils';

interface QueueTableProps {
  items: CampaignQueueItem[];
  loading: boolean;
  selectedIds: Set<string>;
  expandedId: string | null;
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (id: string, checked: boolean) => void;
  onToggleExpand: (id: string) => void;
  onUpdate: () => void;
}

interface ColumnWidths {
  status: number;
  preview: number;
  name: number;
  subject: number;
  previewText: number;
  links: number;
  actions: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  status: 90,
  preview: 50,
  name: 180,
  subject: 200,
  previewText: 200,
  links: 60,
  actions: 80,
};

export function QueueTable({
  items,
  loading,
  selectedIds,
  expandedId,
  onSelectAll,
  onSelectItem,
  onToggleExpand,
  onUpdate,
}: QueueTableProps) {
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_WIDTHS);
  const [resizing, setResizing] = useState<keyof ColumnWidths | null>(null);

  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someSelected = items.some(item => selectedIds.has(item.id));

  const handleResizeStart = (column: keyof ColumnWidths) => (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(column);

    const startX = e.clientX;
    const startWidth = columnWidths[column];

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(40, startWidth + delta);
      setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (loading) {
    return (
      <div className="border rounded-md overflow-hidden">
        <div className="grid grid-cols-[32px_90px_50px_1fr_1fr_1fr_60px_80px] text-xs font-medium text-muted-foreground bg-muted/30 border-b">
          <div className="px-2 py-2"></div>
          <div className="px-2 py-2">Status</div>
          <div className="px-2 py-2">Preview</div>
          <div className="px-2 py-2">Name</div>
          <div className="px-2 py-2">Subject Line</div>
          <div className="px-2 py-2">Preview Text</div>
          <div className="px-2 py-2">Links</div>
          <div className="px-2 py-2">Actions</div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[32px_90px_50px_1fr_1fr_1fr_60px_80px] border-b last:border-b-0">
            <div className="px-2 py-2"><Skeleton className="h-4 w-4" /></div>
            <div className="px-2 py-2"><Skeleton className="h-5 w-16" /></div>
            <div className="px-2 py-2"><Skeleton className="h-10 w-8" /></div>
            <div className="px-2 py-2"><Skeleton className="h-4 w-28" /></div>
            <div className="px-2 py-2"><Skeleton className="h-4 w-36" /></div>
            <div className="px-2 py-2"><Skeleton className="h-4 w-36" /></div>
            <div className="px-2 py-2"><Skeleton className="h-4 w-8" /></div>
            <div className="px-2 py-2"><Skeleton className="h-6 w-14" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border p-12 text-center">
        <p className="text-muted-foreground">No campaigns in queue</p>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a campaign or send one from Figma to get started
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Header */}
      <div 
        className="flex text-xs font-medium text-muted-foreground bg-muted/30 border-b select-none"
        style={{ cursor: resizing ? 'col-resize' : 'default' }}
      >
        <div className="w-8 flex-shrink-0 px-2 py-2 flex items-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onSelectAll}
            aria-label="Select all"
            {...(someSelected && !allSelected ? { 'data-state': 'indeterminate' } : {})}
          />
        </div>
        <div 
          className="relative flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ width: columnWidths.status }}
        >
          Status
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('status')}
          />
        </div>
        <div 
          className="relative flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ width: columnWidths.preview }}
        >
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('preview')}
          />
        </div>
        <div 
          className="relative flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ width: columnWidths.name }}
        >
          Name
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('name')}
          />
        </div>
        <div 
          className="relative flex-1 min-w-0 flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ minWidth: columnWidths.subject }}
        >
          Subject Line
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('subject')}
          />
        </div>
        <div 
          className="relative flex-1 min-w-0 flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ minWidth: columnWidths.previewText }}
        >
          Preview Text
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('previewText')}
          />
        </div>
        <div 
          className="relative flex items-center px-2 py-2 border-r border-transparent hover:border-border"
          style={{ width: columnWidths.links }}
        >
          Links
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20"
            onMouseDown={handleResizeStart('links')}
          />
        </div>
        <div 
          className="flex items-center px-2 py-2"
          style={{ width: columnWidths.actions }}
        >
        </div>
      </div>

      {/* Rows */}
      <div>
        {items.map((item) => (
          <React.Fragment key={item.id}>
            <QueueRow
              item={item}
              selected={selectedIds.has(item.id)}
              isExpanded={expandedId === item.id}
              onSelect={(checked) => onSelectItem(item.id, checked)}
              onToggleExpand={() => onToggleExpand(item.id)}
              columnWidths={columnWidths}
            />
            {expandedId === item.id && (
              <ExpandedRowPanel
                item={item}
                onUpdate={onUpdate}
                onClose={() => onToggleExpand(item.id)}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
