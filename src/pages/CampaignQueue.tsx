import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, X, Trash2, Archive, Loader2, Timer, Upload, Inbox, Search, Rows3, AlignJustify, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueueTable } from '@/components/queue/QueueTable';
import { QueueDensity } from '@/components/queue/QueueRow';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCampaignQueue, CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { SetupChecklist } from '@/components/onboarding/SetupChecklist';
import { NextStepBanner } from '@/components/onboarding/NextStepBanner';
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
  const { items, loading, isFetching, refresh, presetsByBrand, klaviyoListsByBrand, brandDataByBrand, userZoomLevel } = useCampaignQueue();
  const { data: onboarding } = useOnboardingStatus();

  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showTimers, setShowTimers] = useState(() => localStorage.getItem('queueShowTimers') === 'true');
  const [density, setDensity] = useState<QueueDensity>(() =>
    localStorage.getItem('queueDensity') === 'compact' ? 'compact' : 'comfortable'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const handleSetDensity = (d: QueueDensity) => {
    setDensity(d);
    localStorage.setItem('queueDensity', d);
  };
  
  const handleToggleTimers = () => {
    setShowTimers(prev => {
      const newValue = !prev;
      localStorage.setItem('queueShowTimers', String(newValue));
      return newValue;
    });
  };
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Derive unique brands from loaded items (no extra fetch needed)
  const brands = useMemo(() => {
    const brandMap = new Map<string, string>();
    items.forEach(item => {
      if (item.brand_id && item.brands?.name) {
        brandMap.set(item.brand_id, item.brands.name);
      }
    });
    return Array.from(brandMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const q = searchQuery.trim().toLowerCase();
  const filteredItems = items.filter(item => {
    const matchesBrand = brandFilter === 'all' || item.brand_id === brandFilter;
    const matchesClosed = showClosed || item.status !== 'closed';
    const matchesSearch =
      !q ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.selected_subject_line || '').toLowerCase().includes(q) ||
      ((item as any).brands?.name || '').toLowerCase().includes(q);
    return matchesBrand && matchesClosed && matchesSearch;
  });

  const needsReviewCount = items.filter(
    (i) => i.status === 'ready_for_review' || i.status === 'approved' || i.status === 'failed'
  ).length;
  const activeCount = items.filter((i) => i.status !== 'closed').length;

  // Onboarding-aware empty states. While the onboarding query is still
  // loading, the checklist renders its own skeleton — no flash of the
  // wrong empty state.
  const queueEmpty = !loading && items.length === 0;
  const showChecklist = queueEmpty && !onboarding?.done;
  const showEmptyState = queueEmpty && onboarding?.done === true;
  const showNextStepBanner = !loading && items.length > 0 && onboarding && !onboarding.done && !!onboarding.nextStep;

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [brandFilter, showClosed]);

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // Selection handlers
  const handleSelectItem = (id: string, isSelected: boolean, shiftKey?: boolean) => {
    const currentIndex = filteredItems.findIndex(item => item.id === id);
    
    if (shiftKey && lastSelectedIndex !== null && currentIndex !== -1) {
      // Shift+click: select range between lastSelectedIndex and currentIndex
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredItems[i].id);
        }
        return next;
      });
    } else {
      // Normal click: toggle single item
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (isSelected) next.add(id);
        else next.delete(id);
        return next;
      });
    }
    
    // Always update last selected index on any click
    if (currentIndex !== -1) {
      setLastSelectedIndex(currentIndex);
    }
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
          .select('klaviyo_key_set, footer_html')
          .eq('id', item.brand_id)
          .single();

        if (brandError || !brand?.klaviyo_key_set) {
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
            brandId: item.brand_id,
            queueId: item.id,
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
      {/* Topbar — title block, search, filters, density, primary CTA */}
      <header className="shrink-0 px-6 pt-5 pb-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="mr-2 min-w-0">
            <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.015em]">Queue</h1>
            <p className="mt-px text-[11.5px] text-muted-foreground">
              {needsReviewCount > 0 ? (
                <>
                  <span className="font-semibold text-foreground">{needsReviewCount}</span> need
                  {needsReviewCount === 1 ? 's' : ''} your review · {activeCount} active
                </>
              ) : (
                <>{activeCount} active campaign{activeCount === 1 ? '' : 's'}</>
              )}
            </p>
          </div>

          <div className="flex-1" />

          {/* Search pill */}
          <label className="hidden h-8 w-[210px] cursor-text items-center gap-2 rounded-full bg-card px-3.5 text-[12px] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(240_6%_90%)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_hsl(240_6%_10%/0.35)] lg:flex">
            <Search className="h-3 w-3 shrink-0" strokeWidth={2.2} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search campaigns"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </label>

          {/* Brand filter pill */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 items-center gap-1.5 rounded-full bg-card px-3.5 text-[12px] font-medium text-foreground shadow-[inset_0_0_0_1px_hsl(240_6%_90%)] transition-colors hover:bg-muted/60">
                <span className="max-w-[120px] truncate">
                  {brandFilter === 'all' ? 'All brands' : brands.find((b) => b.id === brandFilter)?.name || 'Brand'}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" strokeWidth={2.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl border-0 p-1 shadow-floating">
              <DropdownMenuItem
                className="rounded-lg text-[12px]"
                onClick={() => setBrandFilter('all')}
              >
                All brands
              </DropdownMenuItem>
              {brands.map((brand) => (
                <DropdownMenuItem
                  key={brand.id}
                  className="rounded-lg text-[12px]"
                  onClick={() => setBrandFilter(brand.id)}
                >
                  {brand.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Active / Closed segmented pill */}
          <div className="flex h-8 items-center rounded-full bg-secondary p-[3px] text-[11.5px] font-medium">
            {([false, true] as const).map((closed) => (
              <button
                key={String(closed)}
                onClick={() => setShowClosed(closed)}
                className={
                  showClosed === closed
                    ? 'flex h-[26px] items-center rounded-full bg-card px-3 font-semibold text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.06)]'
                    : 'flex h-[26px] items-center rounded-full px-3 text-muted-foreground transition-colors hover:text-foreground'
                }
              >
                {closed ? 'All' : 'Active'}
              </button>
            ))}
          </div>

          {/* Density toggle — Comfortable / Compact */}
          <div className="flex h-8 items-center rounded-full bg-secondary p-[3px]" role="group" aria-label="Row density">
            <button
              onClick={() => handleSetDensity('comfortable')}
              title="Comfortable rows"
              className={
                density === 'comfortable'
                  ? 'flex h-[26px] w-8 items-center justify-center rounded-full bg-card text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.06)]'
                  : 'flex h-[26px] w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              <Rows3 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <button
              onClick={() => handleSetDensity('compact')}
              title="Compact rows — see everything"
              className={
                density === 'compact'
                  ? 'flex h-[26px] w-8 items-center justify-center rounded-full bg-card text-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.06)]'
                  : 'flex h-[26px] w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground'
              }
            >
              <AlignJustify className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          {/* Quiet utilities */}
          <button
            onClick={handleToggleTimers}
            title={showTimers ? 'Hide processing timers' : 'Show processing timers'}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              showTimers ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <Timer className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => refresh()}
            disabled={isFetching}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>

          {/* The one filled CTA on the page */}
          <button
            onClick={() => navigate('/upload')}
            className="shadow-button flex h-[34px] items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <Upload className="h-3 w-3" strokeWidth={2.4} />
            Upload design
          </button>
        </div>
      </header>

      {/* Floating Bottom Bulk Action Bar - ClickUp style */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 rounded-full bg-primary py-1.5 pl-4 pr-2 shadow-floating">
            {/* Selection count with clear button */}
            <div className="flex items-center gap-2 border-r border-white/15 pr-3 text-primary-foreground">
              <span className="text-[12.5px] font-medium tabular-nums">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set(filteredItems.map(i => i.id)))}
                className="text-[11.5px] font-medium text-primary-foreground/60 transition-colors hover:text-primary-foreground"
              >
                Select all
              </button>
              <button 
                onClick={handleClearSelection}
                className="text-primary-foreground/50 transition-colors hover:text-primary-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Bulk Approve - only if all selected are ready_for_review */}
              {canBulkApprove && (
                <Button 
                  size="sm" 
                  className="h-7 rounded-full bg-card text-foreground hover:bg-card/90"
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
                className="h-7 rounded-full text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Close
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isBulkProcessing}
                className="h-7 rounded-full text-red-300 hover:bg-white/10 hover:text-red-200"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-6 pb-10 md:px-8">
        {showChecklist ? (
          /* New user: queue is empty and setup is incomplete — guide them */
          <div className="mx-auto max-w-xl py-8">
            <SetupChecklist />
          </div>
        ) : showEmptyState ? (
          /* Set up, but nothing in the queue yet */
          <div className="glow-ember mx-auto flex min-h-[460px] max-w-xl flex-col items-center justify-center rounded-3xl bg-card py-16 text-center shadow-card animate-fade-up">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Inbox className="h-5 w-5 text-foreground/70" strokeWidth={1.75} />
            </div>
            <p className="mt-5 text-[20px] font-semibold tracking-[-0.01em] leading-tight">Your queue is clear</p>
            <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
              Send a frame from Figma or upload a design — Sendr slices it, QAs it
              against your brand memory, and builds it in Klaviyo.
            </p>
            <Button
              size="default"
              className="shadow-button mt-6 rounded-full"
              onClick={() => navigate('/upload')}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload a design
            </Button>
          </div>
        ) : (
          <>
            {showNextStepBanner && onboarding?.nextStep && (
              <div className="mb-4 min-w-0 max-w-2xl">
                <NextStepBanner step={onboarding.nextStep} />
              </div>
            )}
            <QueueTable
                items={filteredItems}
                loading={loading}
                expandedId={expandedId}
                onToggleExpand={handleToggleExpand}
                onUpdate={refresh}
                presetsByBrand={presetsByBrand}
                klaviyoListsByBrand={klaviyoListsByBrand}
                brandDataByBrand={brandDataByBrand}
                userZoomLevel={userZoomLevel}
                selectedIds={selectedIds}
                onSelectItem={handleSelectItem}
                onSelectAll={handleSelectAll}
                showTimers={showTimers}
                onToggleTimers={handleToggleTimers}
                density={density}
              />
          </>
        )}
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
              className="bg-destructive hover:bg-destructive"
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
