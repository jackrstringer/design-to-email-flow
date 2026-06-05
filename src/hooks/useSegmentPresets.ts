import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface KlaviyoSegment {
  id: string;
  name: string;
  /** True when this segment ID no longer exists in the connected Klaviyo account. */
  missing?: boolean;
}

export interface SegmentPreset {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  included_segments: KlaviyoSegment[];
  excluded_segments: KlaviyoSegment[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to hydrate segment IDs with names from Klaviyo segments list.
// IMPORTANT: We KEEP entries whose IDs are no longer in Klaviyo and flag them
// with `missing: true` so the UI can surface them as broken and block sends.
const hydrateSegments = (
  segmentData: unknown[],
  klaviyoList: KlaviyoSegment[],
  klaviyoLoaded: boolean
): KlaviyoSegment[] => {
  if (!Array.isArray(segmentData)) return [];

  return segmentData.map((seg): KlaviyoSegment | null => {
    const id =
      typeof seg === 'string'
        ? seg
        : typeof seg === 'object' && seg !== null && 'id' in seg
        ? String((seg as { id: string }).id)
        : null;
    if (!id) return null;

    const storedName =
      typeof seg === 'object' && seg !== null && 'name' in seg
        ? String((seg as { name: string }).name)
        : null;

    const live = klaviyoList.find((k) => k.id === id);
    if (live) return { id: live.id, name: live.name };

    // Live list hasn't loaded yet — trust stored data, don't flag as missing.
    if (!klaviyoLoaded) {
      return { id, name: storedName || id };
    }

    return { id, name: storedName || `Deleted segment (${id})`, missing: true };
  }).filter(Boolean) as KlaviyoSegment[];
};

// Separate hook for Klaviyo segments - cached per API key
export function useKlaviyoSegments(klaviyoApiKey: string | null | undefined) {
  return useQuery({
    queryKey: ['klaviyo-segments', klaviyoApiKey],
    queryFn: async () => {
      if (!klaviyoApiKey) return [];
      
      const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
        body: { klaviyoApiKey },
      });

      if (error) throw error;
      return (data.lists || []) as KlaviyoSegment[];
    },
    enabled: !!klaviyoApiKey,
    staleTime: 1000 * 60 * 5, // 5 minutes - segments rarely change
  });
}

export function useSegmentPresets(brandId: string | null, klaviyoApiKey?: string | null) {
  const queryClient = useQueryClient();

  // Fetch Klaviyo segments (cached per API key)
  const {
    data: klaviyoSegments = [],
    isLoading: loadingSegments,
    isFetched: klaviyoLoaded,
  } = useKlaviyoSegments(klaviyoApiKey);

  // Fetch segment presets (cached per brand ID)
  const {
    data: presets = [],
    isLoading: loadingPresets,
    isFetching,
  } = useQuery({
    queryKey: ['segment-presets', brandId, klaviyoSegments],
    queryFn: async () => {
      if (!brandId) return [];

      const { data, error } = await supabase
        .from('segment_presets')
        .select('*')
        .eq('brand_id', brandId)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;

      return (data || []).map((p): SegmentPreset => ({
        id: p.id,
        brand_id: p.brand_id,
        name: p.name,
        description: p.description || null,
        included_segments: hydrateSegments(p.included_segments as unknown[], klaviyoSegments, klaviyoLoaded),
        excluded_segments: hydrateSegments(p.excluded_segments as unknown[], klaviyoSegments, klaviyoLoaded),
        is_default: p.is_default,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));
    },
    enabled: !!brandId && (!!klaviyoApiKey ? klaviyoLoaded : true),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const invalidatePresets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['segment-presets', brandId] });
  }, [queryClient, brandId]);

  const createPreset = useCallback(async (preset: Omit<SegmentPreset, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (preset.is_default && brandId) {
        await supabase
          .from('segment_presets')
          .update({ is_default: false })
          .eq('brand_id', brandId);
      }

      const { data, error } = await supabase
        .from('segment_presets')
        .insert({
          brand_id: preset.brand_id,
          name: preset.name,
          description: preset.description,
          included_segments: preset.included_segments as any,
          excluded_segments: preset.excluded_segments as any,
          is_default: preset.is_default,
        })
        .select()
        .single();

      if (error) throw error;

      invalidatePresets();
      toast.success('Segment set created');
      return data;
    } catch (error) {
      console.error('Error creating segment preset:', error);
      toast.error('Failed to create segment set');
      return null;
    }
  }, [brandId, invalidatePresets]);

  const updatePreset = useCallback(async (id: string, updates: Partial<SegmentPreset>) => {
    try {
      if (updates.is_default && brandId) {
        await supabase
          .from('segment_presets')
          .update({ is_default: false })
          .eq('brand_id', brandId)
          .neq('id', id);
      }

      const updateData: Record<string, any> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.included_segments !== undefined) updateData.included_segments = updates.included_segments;
      if (updates.excluded_segments !== undefined) updateData.excluded_segments = updates.excluded_segments;
      if (updates.is_default !== undefined) updateData.is_default = updates.is_default;

      const { error } = await supabase
        .from('segment_presets')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      invalidatePresets();
      return true;
    } catch (error) {
      console.error('Error updating segment preset:', error);
      toast.error('Failed to update segment set');
      return false;
    }
  }, [brandId, invalidatePresets]);

  const deletePreset = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('segment_presets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      invalidatePresets();
      toast.success('Segment set deleted');
      return true;
    } catch (error) {
      console.error('Error deleting segment preset:', error);
      toast.error('Failed to delete segment set');
      return false;
    }
  }, [invalidatePresets]);

  // Determine loading state - only show loading on initial load with no data
  const isInitialLoading = (loadingPresets && presets.length === 0) || 
    (!!klaviyoApiKey && !klaviyoLoaded);

  return {
    presets,
    loading: isInitialLoading,
    isFetching,
    klaviyoSegments,
    loadingSegments,
    klaviyoLoaded,
    createPreset,
    updatePreset,
    deletePreset,
    refresh: invalidatePresets,
  };
}
