import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SitemapImportJob, TriggerSitemapImportResponse } from '@/types/link-intelligence';

const RUNNING_STATUSES = ['pending', 'parsing', 'crawling', 'crawling_nav', 'fetching_titles', 'generating_embeddings'];
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function useSitemapImport(brandId: string, domain?: string) {
  const queryClient = useQueryClient();
  const previousStatusRef = useRef<string | null>(null);

  // Fetch latest import job
  const jobQuery = useQuery({
    queryKey: ['sitemap-import-job', brandId],
    queryFn: async (): Promise<SitemapImportJob | null> => {
      const { data, error } = await supabase
        .from('sitemap_import_jobs')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as SitemapImportJob | null;
    },
    enabled: !!brandId,
    // Poll every 3 seconds while job is running
    refetchInterval: (query) => {
      const job = query.state.data as SitemapImportJob | null;
      if (job && RUNNING_STATUSES.includes(job.status)) {
        return 3000;
      }
      return false;
    },
  });

  const job = jobQuery.data;
  const isRunning = job && RUNNING_STATUSES.includes(job.status);
  const isComplete = job?.status === 'complete';
  const isFailed = job?.status === 'failed';
  const isCancelled = job?.status === 'cancelled';

  // CRITICAL: When job transitions to complete, immediately refetch link data
  useEffect(() => {
    const currentStatus = job?.status || null;
    const prevStatus = previousStatusRef.current;
    
    // Check if status just changed to 'complete' from a running status
    if (
      currentStatus === 'complete' && 
      prevStatus && 
      RUNNING_STATUSES.includes(prevStatus)
    ) {
      console.log('[useSitemapImport] Job completed, refreshing link index');
      // Invalidate immediately to show new links
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
    }
    
    previousStatusRef.current = currentStatus;
  }, [job?.status, brandId, queryClient]);

  // Trigger crawl mutation (domain-only, uses Firecrawl)
  const triggerCrawlMutation = useMutation({
    mutationFn: async (): Promise<TriggerSitemapImportResponse> => {
      if (!domain) throw new Error('Domain is required for crawling');
      const { data, error } = await supabase.functions.invoke('trigger-sitemap-import', {
        body: { brand_id: brandId, domain },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-import-job', brandId] });
    },
  });

  // Legacy: Trigger sitemap import mutation
  const triggerSitemapMutation = useMutation({
    mutationFn: async (sitemapUrl: string): Promise<TriggerSitemapImportResponse> => {
      const { data, error } = await supabase.functions.invoke('trigger-sitemap-import', {
        body: { brand_id: brandId, sitemap_url: sitemapUrl },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-import-job', brandId] });
    },
  });

  // Cancel job mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const currentJob = jobQuery.data;
      if (!currentJob) throw new Error('No job to cancel');
      
      const { error } = await supabase
        .from('sitemap_import_jobs')
        .update({ 
          status: 'cancelled',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString()
        })
        .eq('id', currentJob.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-import-job', brandId] });
    },
  });

  // Calculate if job is stale (no activity for 10+ minutes)
  const isStale = useMemo(() => {
    if (!job || !RUNNING_STATUSES.includes(job.status)) return false;
    const lastUpdate = new Date(job.updated_at).getTime();
    const now = Date.now();
    return (now - lastUpdate) > STALE_THRESHOLD_MS;
  }, [job]);

  return {
    job,
    isLoading: jobQuery.isLoading,
    isRunning,
    isComplete,
    isFailed,
    isCancelled,
    isStale,
    // Primary: domain-only crawl using Firecrawl
    triggerCrawl: triggerCrawlMutation.mutateAsync,
    isCrawling: triggerCrawlMutation.isPending,
    // Legacy: sitemap URL import
    triggerImport: triggerSitemapMutation.mutateAsync,
    isTriggering: triggerSitemapMutation.isPending,
    // Cancel
    cancelJob: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
    refetch: jobQuery.refetch,
  };
}
