import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BrandLinkPreferences } from '@/types/link-intelligence';

export function useLinkPreferences(brandId: string) {
  const queryClient = useQueryClient();

  // Fetch current preferences
  const preferencesQuery = useQuery({
    queryKey: ['link-preferences', brandId],
    queryFn: async (): Promise<BrandLinkPreferences | null> => {
      const { data, error } = await supabase
        .from('brands')
        .select('link_preferences')
        .eq('id', brandId)
        .single();
      
      if (error) throw error;
      return (data?.link_preferences as unknown as BrandLinkPreferences) || null;
    },
    enabled: !!brandId,
  });

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: async (preferences: Partial<BrandLinkPreferences>) => {
      const { data, error } = await supabase.functions.invoke('update-brand-link-preferences', {
        body: { brand_id: brandId, preferences },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['link-preferences', brandId] });
    },
  });

  return {
    preferences: preferencesQuery.data,
    isLoading: preferencesQuery.isLoading,
    updatePreferences: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    refetch: preferencesQuery.refetch,
  };
}
