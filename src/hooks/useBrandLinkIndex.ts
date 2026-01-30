import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { 
  BrandLinkIndexEntry, 
  GetBrandLinkIndexResponse, 
  LinkFilter 
} from '@/types/link-intelligence';

interface UseBrandLinkIndexParams {
  brandId: string;
  page?: number;
  limit?: number;
  filter?: LinkFilter;
  search?: string;
}

export function useBrandLinkIndex({
  brandId,
  page = 1,
  limit = 50,
  filter = 'all',
  search = '',
}: UseBrandLinkIndexParams) {
  const queryClient = useQueryClient();

  // Fetch paginated links
  const linksQuery = useQuery({
    queryKey: ['brand-link-index', brandId, page, limit, filter, search],
    queryFn: async (): Promise<GetBrandLinkIndexResponse> => {
      const { data, error } = await supabase.functions.invoke('get-brand-link-index', {
        body: { brand_id: brandId, page, limit, filter, search },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!brandId,
  });

  // Get link stats
  const statsQuery = useQuery({
    queryKey: ['brand-link-stats', brandId],
    queryFn: async () => {
      // Get counts by type and health
      const { data: allLinks, error } = await supabase
        .from('brand_link_index')
        .select('id, link_type, is_healthy')
        .eq('brand_id', brandId);
      
      if (error) throw error;
      
      const stats = {
        total: allLinks?.length || 0,
        products: allLinks?.filter(l => l.link_type === 'product').length || 0,
        collections: allLinks?.filter(l => l.link_type === 'collection').length || 0,
        healthy: allLinks?.filter(l => l.is_healthy).length || 0,
        unhealthy: allLinks?.filter(l => !l.is_healthy).length || 0,
      };
      
      return stats;
    },
    enabled: !!brandId,
  });

  // Add link mutation
  const addLinkMutation = useMutation({
    mutationFn: async (params: { url: string; title: string; link_type: string }) => {
      const { data, error } = await supabase.functions.invoke('add-brand-link', {
        body: { brand_id: brandId, ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
    },
  });

  // Delete link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-brand-link', {
        body: { link_id: linkId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-link-index', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brand-link-stats', brandId] });
    },
  });

  return {
    links: linksQuery.data?.links || [],
    total: linksQuery.data?.total || 0,
    page: linksQuery.data?.page || 1,
    totalPages: linksQuery.data?.totalPages || 0,
    isLoading: linksQuery.isLoading,
    error: linksQuery.error,
    stats: statsQuery.data || { total: 0, products: 0, collections: 0, healthy: 0, unhealthy: 0 },
    statsLoading: statsQuery.isLoading,
    addLink: addLinkMutation.mutateAsync,
    isAdding: addLinkMutation.isPending,
    deleteLink: deleteLinkMutation.mutateAsync,
    isDeleting: deleteLinkMutation.isPending,
    refetch: () => {
      linksQuery.refetch();
      statsQuery.refetch();
    },
  };
}
