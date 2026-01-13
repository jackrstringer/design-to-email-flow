import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow } from './QueueRow';
import { ExpandedRowPanel } from './ExpandedRowPanel';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';

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
  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  const someSelected = items.some(item => selectedIds.has(item.id));

  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-16">Preview</TableHead>
              <TableHead className="w-48">Name</TableHead>
              <TableHead>Subject Line</TableHead>
              <TableHead>Preview Text</TableHead>
              <TableHead className="w-20">Links</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-14 w-9" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-7 w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                aria-label="Select all"
                {...(someSelected && !allSelected ? { 'data-state': 'indeterminate' } : {})}
              />
            </TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-16">Preview</TableHead>
            <TableHead className="w-48">Name</TableHead>
            <TableHead>Subject Line</TableHead>
            <TableHead>Preview Text</TableHead>
            <TableHead className="w-20">Links</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <React.Fragment key={item.id}>
              <QueueRow
                item={item}
                selected={selectedIds.has(item.id)}
                isExpanded={expandedId === item.id}
                onSelect={(checked) => onSelectItem(item.id, checked)}
                onToggleExpand={() => onToggleExpand(item.id)}
              />
              {expandedId === item.id && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0 border-t-0">
                    <ExpandedRowPanel
                      item={item}
                      onUpdate={onUpdate}
                      onClose={() => onToggleExpand(item.id)}
                    />
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
