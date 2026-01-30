import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SitemapImportJob, TriggerSitemapImportResponse } from '@/types/link-intelligence';

const RUNNING_STATUSES = ['pending', 'parsing', 'crawling', 'crawling_nav', 'fetching_titles', 'generating_embeddings'];

export function useSitemapImport(brandId: string, domain?: string) {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
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
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
    },
  });

  const job = jobQuery.data;
  const isRunning = job && RUNNING_STATUSES.includes(job.status);
  const isComplete = job?.status === 'complete';
  const isFailed = job?.status === 'failed';

  return {
    job,
    isLoading: jobQuery.isLoading,
    isRunning,
    isComplete,
    isFailed,
    // Primary: domain-only crawl using Firecrawl
    triggerCrawl: triggerCrawlMutation.mutateAsync,
    isCrawling: triggerCrawlMutation.isPending,
    // Legacy: sitemap URL import
    triggerImport: triggerSitemapMutation.mutateAsync,
    isTriggering: triggerSitemapMutation.isPending,
    refetch: jobQuery.refetch,
  };
}
