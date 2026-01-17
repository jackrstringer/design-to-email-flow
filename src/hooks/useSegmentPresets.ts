import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface KlaviyoSegment {
  id: string;
  name: string;
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

// Helper to hydrate segment IDs with names from Klaviyo segments list
// Returns null for segments that aren't found (to filter out while loading)
const hydrateSegments = (
  segmentData: unknown[],
  klaviyoList: KlaviyoSegment[]
): KlaviyoSegment[] => {
  if (!Array.isArray(segmentData)) return [];
  
  return segmentData.map((seg) => {
    // If already an object with id and name, return as-is
    if (typeof seg === 'object' && seg !== null && 'id' in seg && 'name' in seg) {
      return seg as KlaviyoSegment;
    }
    // If it's just an ID string, find the matching Klaviyo segment
    const id = typeof seg === 'object' && seg !== null && 'id' in seg 
      ? (seg as { id: string }).id 
      : String(seg);
    const found = klaviyoList.find((k) => k.id === id);
    // Return null if not found - we'll filter these out to avoid showing IDs
    return found || null;
  }).filter(Boolean) as KlaviyoSegment[];
};

export function useSegmentPresets(brandId: string | null) {
  const [presets, setPresets] = useState<SegmentPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [klaviyoSegments, setKlaviyoSegments] = useState<KlaviyoSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [klaviyoLoaded, setKlaviyoLoaded] = useState(false);
  
  // Use ref to avoid recreating callbacks when klaviyoSegments changes
  const klaviyoSegmentsRef = useRef<KlaviyoSegment[]>([]);
  useEffect(() => {
    klaviyoSegmentsRef.current = klaviyoSegments;
  }, [klaviyoSegments]);

  const fetchPresets = useCallback(async (klaviyoList?: KlaviyoSegment[]) => {
    if (!brandId) {
      setPresets([]);
      setLoading(false);
      return;
    }

    // Use provided list or current ref value
    const segmentsToUse = klaviyoList ?? klaviyoSegmentsRef.current;

    try {
      const { data, error } = await supabase
        .from('segment_presets')
        .select('*')
        .eq('brand_id', brandId)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;

      const formattedPresets: SegmentPreset[] = (data || []).map((p) => ({
        id: p.id,
        brand_id: p.brand_id,
        name: p.name,
        description: p.description || null,
        included_segments: hydrateSegments(p.included_segments as unknown[], segmentsToUse),
        excluded_segments: hydrateSegments(p.excluded_segments as unknown[], segmentsToUse),
        is_default: p.is_default,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));

      setPresets(formattedPresets);
    } catch (error) {
      console.error('Error fetching segment presets:', error);
      toast.error('Failed to load segment presets');
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  const fetchKlaviyoSegments = useCallback(async (klaviyoApiKey: string) => {
    if (!klaviyoApiKey) {
      setKlaviyoSegments([]);
      setKlaviyoLoaded(true);
      // Still fetch presets even without Klaviyo
      await fetchPresets([]);
      return;
    }

    setLoadingSegments(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
        body: { klaviyoApiKey },
      });

      if (error) throw error;

      const segments = data.lists || [];
      setKlaviyoSegments(segments);
      klaviyoSegmentsRef.current = segments;
      
      // Fetch presets with the fresh segments data
      await fetchPresets(segments);
    } catch (error) {
      console.error('Error fetching Klaviyo segments:', error);
      toast.error('Failed to load Klaviyo segments');
      // Still fetch presets even on error
      await fetchPresets([]);
    } finally {
      setLoadingSegments(false);
      setKlaviyoLoaded(true);
    }
  }, [fetchPresets]);

  const createPreset = useCallback(async (preset: Omit<SegmentPreset, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      // If this is being set as default, unset other defaults first
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

      await fetchPresets();
      toast.success('Segment set created');
      return data;
    } catch (error) {
      console.error('Error creating segment preset:', error);
      toast.error('Failed to create segment set');
      return null;
    }
  }, [brandId, fetchPresets]);

  const updatePreset = useCallback(async (id: string, updates: Partial<SegmentPreset>) => {
    try {
      // If setting as default, unset other defaults first
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

      await fetchPresets();
      return true;
    } catch (error) {
      console.error('Error updating segment preset:', error);
      toast.error('Failed to update segment set');
      return false;
    }
  }, [brandId, fetchPresets]);

  const deletePreset = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('segment_presets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchPresets();
      toast.success('Segment set deleted');
      return true;
    } catch (error) {
      console.error('Error deleting segment preset:', error);
      toast.error('Failed to delete segment set');
      return false;
    }
  }, [fetchPresets]);

  // Reset state when brand changes
  useEffect(() => {
    setKlaviyoLoaded(false);
    setPresets([]);
    setKlaviyoSegments([]);
    klaviyoSegmentsRef.current = [];
    setLoading(true);
  }, [brandId]);

  // Set up realtime subscription
  useEffect(() => {
    if (!brandId) return;

    const channel = supabase
      .channel(`segment_presets_${brandId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'segment_presets',
          filter: `brand_id=eq.${brandId}`,
        },
        () => {
          // Use ref to get current klaviyo segments
          fetchPresets(klaviyoSegmentsRef.current);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandId, fetchPresets]);

  return {
    presets,
    loading: loading || !klaviyoLoaded,
    klaviyoSegments,
    loadingSegments,
    klaviyoLoaded,
    fetchKlaviyoSegments,
    createPreset,
    updatePreset,
    deletePreset,
    refresh: () => fetchPresets(klaviyoSegmentsRef.current),
  };
}
