import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Building, X, Trash2, Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { QueueTable } from '@/components/queue/QueueTable';
import { useCampaignQueue, CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Brand {
  id: string;
  name: string;
}

export default function CampaignQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, loading, refresh, presetsByBrand } = useCampaignQueue();
  
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch brands for filter dropdown
  useEffect(() => {
    async function fetchBrands() {
      if (!user) return;
      const { data } = await supabase
        .from('brands')
        .select('id, name')
        .order('name');
      if (data) setBrands(data);
    }
    fetchBrands();
  }, [user]);

  const filteredItems = items.filter(item => {
    const matchesBrand = brandFilter === 'all' || item.brand_id === brandFilter;
    const matchesClosed = showClosed || item.status !== 'closed';
    return matchesBrand && matchesClosed;
  });

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [brandFilter, showClosed]);

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // Selection handlers
  const handleSelectItem = (id: string, isSelected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      // All selected, deselect all
      setSelectedIds(new Set());
    } else {
      // Select all visible items
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  // Get selected items data
  const selectedItems = useMemo(() => 
    filteredItems.filter(item => selectedIds.has(item.id)),
    [filteredItems, selectedIds]
  );

  // Check if all selected are ready for review (can bulk approve)
  const canBulkApprove = useMemo(() => 
    selectedItems.length > 0 && 
    selectedItems.every(item => item.status === 'ready_for_review'),
    [selectedItems]
  );

  // Get unique brand count for selected items
  const uniqueBrandIds = useMemo(() => 
    new Set(selectedItems.map(item => item.brand_id).filter(Boolean)),
    [selectedItems]
  );

  // Bulk approve and build
  const handleBulkApprove = async () => {
    if (!canBulkApprove) return;
    
    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    // Step 1: Mark ALL selected items as processing first (shows blue "Building..." state)
    await supabase
      .from('campaign_queue')
      .update({ 
        status: 'processing', 
        processing_step: 'Building in Klaviyo',
        processing_percent: 0 
      })
      .in('id', Array.from(selectedIds));
    
    // Refresh so UI shows processing state for all items immediately
    refresh();

    for (const item of selectedItems) {
      try {
        // Validate subject line and preview text
        if (!item.selected_subject_line || !item.selected_preview_text) {
          await supabase
            .from('campaign_queue')
            .update({ 
              status: 'ready_for_review',
              processing_step: null,
              processing_percent: null
            })
            .eq('id', item.id);
          errorCount++;
          continue;
        }

        // Fetch brand data
        const { data: brand, error: brandError } = await supabase
          .from('brands')
          .select('klaviyo_api_key, footer_html')
          .eq('id', item.brand_id)
          .single();

        if (brandError || !brand?.klaviyo_api_key) {
          await supabase
            .from('campaign_queue')
            .update({ 
              status: 'ready_for_review',
              processing_step: null,
              processing_percent: null
            })
            .eq('id', item.id);
          errorCount++;
          continue;
        }

        // Load footer
        let footerHtml: string | null = null;
        const { data: primaryFooter } = await supabase
          .from('brand_footers')
          .select('html')
          .eq('brand_id', item.brand_id)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (primaryFooter?.html) {
          footerHtml = primaryFooter.html;
        } else {
          const { data: recentFooter } = await supabase
            .from('brand_footers')
            .select('html')
            .eq('brand_id', item.brand_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          footerHtml = recentFooter?.html || brand.footer_html || null;
        }

        // Fetch segment preset
        let includedSegments: string[] = [];
        let excludedSegments: string[] = [];

        if (item.selected_segment_preset_id) {
          const { data: preset } = await supabase
            .from('segment_presets')
            .select('included_segments, excluded_segments')
            .eq('id', item.selected_segment_preset_id)
            .single();

          if (preset) {
            includedSegments = (preset.included_segments as string[]) || [];
            excludedSegments = (preset.excluded_segments as string[]) || [];
          }
        } else if (item.brand_id) {
          const { data: defaultPreset } = await supabase
            .from('segment_presets')
            .select('included_segments, excluded_segments')
            .eq('brand_id', item.brand_id)
            .eq('is_default', true)
            .single();

          if (defaultPreset) {
            includedSegments = (defaultPreset.included_segments as string[]) || [];
            excludedSegments = (defaultPreset.excluded_segments as string[]) || [];
          }
        }

        if (includedSegments.length === 0) {
          await supabase
            .from('campaign_queue')
            .update({ 
              status: 'ready_for_review',
              processing_step: null,
              processing_percent: null
            })
            .eq('id', item.id);
          errorCount++;
          continue;
        }

        // Push to Klaviyo
        const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
          body: {
            templateName: item.name,
            klaviyoApiKey: brand.klaviyo_api_key,
            subjectLine: item.selected_subject_line,
            previewText: item.selected_preview_text,
            slices: item.slices,
            imageUrl: item.image_url,
            footerHtml: footerHtml,
            mode: 'campaign',
            includedSegments,
            excludedSegments,
            listId: includedSegments[0]
          }
        });

        if (error) throw error;

        if (data) {
          await supabase
            .from('campaign_queue')
            .update({
              status: 'sent_to_klaviyo',
              processing_step: null,
              processing_percent: null,
              klaviyo_template_id: data.templateId,
              klaviyo_campaign_id: data.campaignId,
              klaviyo_campaign_url: data.campaignUrl,
              sent_to_klaviyo_at: new Date().toISOString()
            })
            .eq('id', item.id);
          successCount++;
          refresh(); // Show immediate update as each completes
        }
      } catch (err) {
        console.error('Failed to process campaign:', item.id, err);
        await supabase
          .from('campaign_queue')
          .update({ 
            status: 'ready_for_review',
            processing_step: null,
            processing_percent: null
          })
          .eq('id', item.id);
        errorCount++;
      }
    }

    setIsBulkProcessing(false);
    handleClearSelection();
    refresh();

    if (successCount > 0) {
      toast.success(`Built ${successCount} campaign${successCount > 1 ? 's' : ''} in Klaviyo`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to build ${errorCount} campaign${errorCount > 1 ? 's' : ''}`);
    }
  };

  // Bulk close
  const handleBulkClose = async () => {
    setIsBulkProcessing(true);
    
    const { error } = await supabase
      .from('campaign_queue')
      .update({ status: 'closed' })
      .in('id', Array.from(selectedIds));

    setIsBulkProcessing(false);
    
    if (error) {
      toast.error('Failed to close campaigns');
    } else {
      toast.success(`Closed ${selectedIds.size} campaign${selectedIds.size > 1 ? 's' : ''}`);
      handleClearSelection();
      refresh();
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    setIsBulkProcessing(true);
    
    const { error } = await supabase
      .from('campaign_queue')
      .delete()
      .in('id', Array.from(selectedIds));

    setIsBulkProcessing(false);
    setShowDeleteConfirm(false);
    
    if (error) {
      toast.error('Failed to delete campaigns');
    } else {
      toast.success(`Deleted ${selectedIds.size} campaign${selectedIds.size > 1 ? 's' : ''}`);
      handleClearSelection();
      refresh();
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - Simplified Airtable style */}
      <header className="border-b bg-background shrink-0">
        <div className="px-4">
          <div className="flex h-12 items-center justify-between">
            {/* Left: Title */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Campaign Queue</span>
            </div>
            
            {/* Right: Show Closed + Brand Filter + Refresh */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-closed"
                  checked={showClosed}
                  onCheckedChange={setShowClosed}
                  className="scale-75"
                />
                <Label htmlFor="show-closed" className="text-[12px] text-muted-foreground cursor-pointer">
                  Show Closed
                </Label>
              </div>
              
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-8 w-36 text-[13px]">
                  <Building className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={refresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Bottom Bulk Action Bar - ClickUp style */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg shadow-lg" style={{ backgroundColor: '#1F2937' }}>
            {/* Selection count with clear button */}
            <div className="flex items-center gap-2 text-white border-r border-gray-600 pr-4">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <button 
                onClick={handleClearSelection}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Bulk Approve - only if all selected are ready_for_review */}
              {canBulkApprove && (
                <Button 
                  size="sm" 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                  onClick={handleBulkApprove}
                  disabled={isBulkProcessing}
                >
                  {isBulkProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Approve & Build {selectedIds.size}
                  {uniqueBrandIds.size > 1 && ` for ${uniqueBrandIds.size} Brands`}
                </Button>
              )}
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBulkClose}
                disabled={isBulkProcessing}
                className="text-gray-300 hover:text-white hover:bg-gray-700 h-8"
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Close
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isBulkProcessing}
                className="text-red-400 hover:text-red-300 hover:bg-gray-700 h-8"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - horizontal scroll for table */}
      <main className="px-4 py-4 overflow-x-auto">
        <div className="min-w-max">
          <QueueTable
            items={filteredItems}
            loading={loading}
            expandedId={expandedId}
            onToggleExpand={handleToggleExpand}
            onUpdate={refresh}
            presetsByBrand={presetsByBrand}
            selectedIds={selectedIds}
            onSelectItem={handleSelectItem}
            onSelectAll={handleSelectAll}
          />
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} campaign{selectedIds.size > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected campaigns will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              disabled={isBulkProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isBulkProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
