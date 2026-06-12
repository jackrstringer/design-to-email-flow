import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KnowledgeKind } from '@/lib/agentMeta';

export interface KnowledgeMetadata {
  /** For 'question' entries: 3-5 one-click answer choices. Legacy questions have none. */
  answer_options?: string[];
}

export interface BrandKnowledgeEntry {
  id: string;
  kind: string;
  title: string;
  content: string;
  source: string;
  confidence: number;
  valid_until: string | null;
  times_applied: number;
  metadata: KnowledgeMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntryInput {
  kind: KnowledgeKind;
  title: string;
  content: string;
  valid_until?: string | null;
}

const knowledgeKey = (brandId: string) => ['brand-knowledge', brandId];

export function useBrandKnowledge(brandId: string | undefined) {
  return useQuery({
    queryKey: knowledgeKey(brandId ?? ''),
    enabled: !!brandId,
    staleTime: 30_000,
    queryFn: async (): Promise<BrandKnowledgeEntry[]> => {
      const { data, error } = await supabase
        .from('brand_knowledge')
        .select('id, kind, title, content, source, confidence, valid_until, times_applied, metadata, created_at, updated_at')
        .eq('brand_id', brandId!)
        .is('superseded_by', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        metadata: (row.metadata as KnowledgeMetadata | null) ?? null,
      }));
    },
  });
}

export function useAddKnowledge(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: KnowledgeEntryInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('brand_knowledge').insert({
        brand_id: brandId,
        user_id: user?.id ?? null,
        kind: input.kind,
        title: input.title,
        content: input.content,
        valid_until: input.valid_until || null,
        source: 'manual',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKey(brandId) }),
  });
}

export function useUpdateKnowledge(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: KnowledgeEntryInput & { id: string }) => {
      const { error } = await supabase
        .from('brand_knowledge')
        .update({
          kind: input.kind,
          title: input.title,
          content: input.content,
          valid_until: input.valid_until || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKey(brandId) }),
  });
}

export function useRetireKnowledge(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('brand_knowledge').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: knowledgeKey(brandId) }),
  });
}
