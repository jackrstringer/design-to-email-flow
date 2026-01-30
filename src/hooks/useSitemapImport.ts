import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SitemapImportJob, TriggerSitemapImportResponse } from '@/types/link-intelligence';

export function useSitemapImport(brandId: string) {
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
      if (job && ['pending', 'parsing', 'fetching_titles', 'generating_embeddings'].includes(job.status)) {
        return 3000;
      }
      return false;
    },
  });

  // Trigger import mutation
  const triggerMutation = useMutation({
    mutationFn: async (sitemapUrl: string): Promise<TriggerSitemapImportResponse> => {
      const { data, error } = await supabase.functions.invoke('trigger-sitemap-import', {
        body: { brand_id: brandId, sitemap_url: sitemapUrl },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-import-job', brandId] });
      // Also invalidate link index since it will be updated
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
    },
  });

  const job = jobQuery.data;
  const isRunning = job && ['pending', 'parsing', 'fetching_titles', 'generating_embeddings'].includes(job.status);
  const isComplete = job?.status === 'complete';
  const isFailed = job?.status === 'failed';

  return {
    job,
    isLoading: jobQuery.isLoading,
    isRunning,
    isComplete,
    isFailed,
    triggerImport: triggerMutation.mutateAsync,
    isTriggering: triggerMutation.isPending,
    refetch: jobQuery.refetch,
  };
}
