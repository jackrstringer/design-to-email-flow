// Per-brand favorite links (brands.favorite_links text[]).
// Shared by SliceCanvas link picker and LinksSummaryPopover.
// Cached per brand via React Query so many queue rows share one fetch.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const queryKey = (brandId: string | null | undefined) => ['brand-favorites', brandId];

/** Normalize a URL for comparison: trim whitespace, strip trailing slash. */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function useBrandFavorites(brandId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery<string[]>({
    queryKey: queryKey(brandId),
    queryFn: async () => {
      const { data: brand, error } = await supabase
        .from('brands')
        .select('favorite_links')
        .eq('id', brandId!)
        .single();
      if (error) throw error;
      return (brand?.favorite_links as string[] | null) ?? [];
    },
    enabled: !!brandId,
    staleTime: 1000 * 60 * 5,
  });

  const isFavorite = useCallback(
    (url: string): boolean => {
      const norm = normalizeUrl(url);
      return favorites.some((f) => normalizeUrl(f) === norm);
    },
    [favorites],
  );

  const toggle = useCallback(
    async (url: string) => {
      if (!brandId) return;
      const norm = normalizeUrl(url);
      const current = queryClient.getQueryData<string[]>(queryKey(brandId)) ?? [];
      const isCurrentlyFav = current.some((f) => normalizeUrl(f) === norm);
      const next = isCurrentlyFav
        ? current.filter((f) => normalizeUrl(f) !== norm)
        : [...current, url];

      // Optimistic update
      queryClient.setQueryData<string[]>(queryKey(brandId), next);

      const { error } = await supabase
        .from('brands')
        .update({ favorite_links: next })
        .eq('id', brandId);

      if (error) {
        // Roll back
        queryClient.setQueryData<string[]>(queryKey(brandId), current);
        toast.error('Failed to update favorites');
      }
    },
    [brandId, queryClient],
  );

  return { favorites, isFavorite, toggle };
}
