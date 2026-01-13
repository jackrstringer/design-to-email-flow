import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { QueueRow } from './QueueRow';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';

interface QueueTableProps {
  items: CampaignQueueItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectItem: (id: string, checked: boolean) => void;
  onRowClick: (item: CampaignQueueItem) => void;
}

export function QueueTable({
  items,
  loading,
  selectedIds,
  onSelectAll,
  onSelectItem,
  onRowClick,
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
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-20">Preview</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Subject Line</TableHead>
            <TableHead>Preview Text</TableHead>
            <TableHead className="w-24">Links</TableHead>
            <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-16 w-10" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-8 w-16" /></TableCell>
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
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-20">Preview</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Subject Line</TableHead>
            <TableHead>Preview Text</TableHead>
            <TableHead className="w-24">Links</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onSelect={(checked) => onSelectItem(item.id, checked)}
              onClick={() => onRowClick(item)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
