import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueueTable } from '@/components/queue/QueueTable';
import { QueueFlyout } from '@/components/queue/QueueFlyout';
import { useCampaignQueue, CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { useAuth } from '@/hooks/useAuth';

type StatusFilter = 'all' | 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed';

export default function CampaignQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, loading, refresh } = useCampaignQueue();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flyoutItem, setFlyoutItem] = useState<CampaignQueueItem | null>(null);

  const filteredItems = items.filter(item => {
    const matchesSearch = !search || 
      item.name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredItems.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleRowClick = (item: CampaignQueueItem) => {
    setFlyoutItem(item);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold tracking-tight">Campaign Queue</span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              
              {/* Filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="ready_for_review">Ready</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="sent_to_klaviyo">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Refresh */}
              <Button variant="outline" size="icon" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <QueueTable
          items={filteredItems}
          loading={loading}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onSelectItem={handleSelectItem}
          onRowClick={handleRowClick}
        />

        {/* Bulk Actions Footer */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background p-4">
            <div className="container mx-auto flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedIds(new Set())}>
                  Clear Selection
                </Button>
                <Button variant="secondary">
                  Approve Selected
                </Button>
                <Button>
                  Send to Klaviyo
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Flyout */}
      <QueueFlyout
        item={flyoutItem}
        onClose={() => setFlyoutItem(null)}
        onUpdate={refresh}
      />
    </div>
  );
}
