// Per-brand custom dictionary (brands.custom_dictionary text[]).
// Shared by the queue copy-QA layer and the brand page DictionaryCard.
// Cached per brand via React Query so many queue rows share one fetch.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BrandDictionaryData {
  words: string[];
  name: string | null;
  domain: string | null;
}

const queryKey = (brandId: string | null | undefined) => ['brand-dictionary', brandId];

export function useBrandDictionary(brandId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BrandDictionaryData>({
    queryKey: queryKey(brandId),
    queryFn: async () => {
      const { data: brand, error } = await supabase
        .from('brands')
        .select('custom_dictionary, name, domain')
        .eq('id', brandId!)
        .single();
      if (error) throw error;
      return {
        words: (brand?.custom_dictionary as string[] | null) ?? [],
        name: brand?.name ?? null,
        domain: brand?.domain ?? null,
      };
    },
    enabled: !!brandId,
    staleTime: 1000 * 60 * 5,
  });

  const persist = useCallback(
    async (nextWords: string[], successMessage: string) => {
      if (!brandId) return false;
      const previous = queryClient.getQueryData<BrandDictionaryData>(queryKey(brandId));
      // Optimistic — the red outline should clear the instant the user clicks.
      queryClient.setQueryData<BrandDictionaryData>(queryKey(brandId), (old) =>
        old ? { ...old, words: nextWords } : { words: nextWords, name: null, domain: null },
      );
      const { error } = await supabase
        .from('brands')
        .update({ custom_dictionary: nextWords })
        .eq('id', brandId);
      if (error) {
        queryClient.setQueryData(queryKey(brandId), previous);
        toast.error('Failed to update dictionary');
        return false;
      }
      toast.success(successMessage);
      return true;
    },
    [brandId, queryClient],
  );

  const addWord = useCallback(
    async (word: string) => {
      const cleaned = word.trim();
      if (!cleaned) return false;
      const current = queryClient.getQueryData<BrandDictionaryData>(queryKey(brandId))?.words ?? [];
      if (current.some((w) => w.toLowerCase() === cleaned.toLowerCase())) return true;
      return persist([...current, cleaned], `“${cleaned}” added to dictionary`);
    },
    [brandId, persist, queryClient],
  );

  const removeWord = useCallback(
    async (word: string) => {
      const current = queryClient.getQueryData<BrandDictionaryData>(queryKey(brandId))?.words ?? [];
      return persist(
        current.filter((w) => w.toLowerCase() !== word.toLowerCase()),
        `“${word}” removed from dictionary`,
      );
    },
    [brandId, persist, queryClient],
  );

  return {
    words: data?.words ?? [],
    brandName: data?.name ?? null,
    brandDomain: data?.domain ?? null,
    isLoading,
    addWord,
    removeWord,
  };
}
