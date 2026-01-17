import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface KlaviyoList {
  id: string;
  name: string;
}

export interface SegmentPreset {
  id: string;
  name: string;
  included_segments: string[];
  excluded_segments: string[];
  is_default: boolean;
}

// Normalize segment data - handles both string IDs and {id, name} objects
function normalizeSegmentIds(segments: unknown): string[] {
  if (!Array.isArray(segments)) return [];
  return segments.map(seg => {
    if (typeof seg === 'string') return seg;
    if (typeof seg === 'object' && seg !== null && 'id' in seg) {
      return (seg as { id: string }).id;
    }
    return String(seg);
  });
}

export interface CampaignQueueItem {
  id: string;
  user_id: string;
  brand_id: string | null;
  source: 'figma' | 'upload' | 'clickup';
  source_url: string | null;
  source_metadata: Record<string, unknown> | null;
  name: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  slices: Record<string, unknown>[] | null;
  footer_start_percent: number | null;
  provided_subject_line: string | null;
  provided_preview_text: string | null;
  generated_subject_lines: string[] | null;
  generated_preview_texts: string[] | null;
  selected_subject_line: string | null;
  selected_preview_text: string | null;
  qa_flags: Record<string, unknown>[] | null;
  spelling_errors: Record<string, unknown>[] | null;
  status: 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed' | 'closed';
  processing_step: string | null;
  processing_percent: number;
  error_message: string | null;
  retry_from_step: string | null;
  retry_count: number;
  klaviyo_template_id: string | null;
  klaviyo_campaign_id: string | null;
  klaviyo_campaign_url: string | null;
  sent_to_klaviyo_at: string | null;
  selected_segment_preset_id: string | null;
  // ClickUp integration fields
  copy_source: 'ai' | 'clickup' | 'figma' | 'manual' | null;
  clickup_task_id: string | null;
  clickup_task_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined brand data
  brands?: { id: string; name: string; domain?: string; primary_color?: string } | null;
}

export function useCampaignQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<CampaignQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [presetsByBrand, setPresetsByBrand] = useState<Record<string, SegmentPreset[]>>({});
  const [klaviyoListsByBrand, setKlaviyoListsByBrand] = useState<Record<string, KlaviyoList[]>>({});

  const fetchItems = useCallback(async (isInitial = false) => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Only show loading skeleton on initial load, not refreshes
    if (isInitial) {
      setLoading(true);
    }
    
    const { data, error } = await supabase
      .from('campaign_queue')
      .select('*, brands(id, name, domain, primary_color)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaign queue:', error);
      setItems([]);
    } else {
      setItems((data as CampaignQueueItem[]) || []);
      
      // Extract unique brand IDs and fetch all segment presets
      const brandIds = [...new Set(data?.filter(d => d.brand_id).map(d => d.brand_id) || [])];
      
      if (brandIds.length > 0) {
        const { data: presetsData } = await supabase
          .from('segment_presets')
          .select('*')
          .in('brand_id', brandIds);
        
        if (presetsData) {
          // Group presets by brand_id
          const grouped = presetsData.reduce((acc, p) => {
            const brandId = p.brand_id;
            if (!acc[brandId]) acc[brandId] = [];
            acc[brandId].push({
              id: p.id,
              name: p.name,
              included_segments: normalizeSegmentIds(p.included_segments),
              excluded_segments: normalizeSegmentIds(p.excluded_segments),
              is_default: p.is_default || false,
            });
            return acc;
          }, {} as Record<string, SegmentPreset[]>);
          
          // Sort each brand's presets: defaults first
          Object.keys(grouped).forEach(brandId => {
            grouped[brandId].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
          });
          
          setPresetsByBrand(grouped);
        }

        // Prefetch Klaviyo lists for all brands
        const { data: brandsWithKeys } = await supabase
          .from('brands')
          .select('id, klaviyo_api_key')
          .in('id', brandIds)
          .not('klaviyo_api_key', 'is', null);

        if (brandsWithKeys && brandsWithKeys.length > 0) {
          // Fetch Klaviyo lists in parallel for all brands
          const listFetchPromises = brandsWithKeys.map(async (brand) => {
            try {
              const { data } = await supabase.functions.invoke('get-klaviyo-lists', {
                body: { klaviyoApiKey: brand.klaviyo_api_key }
              });
              return { brandId: brand.id, lists: (data?.lists || []) as KlaviyoList[] };
            } catch {
              return { brandId: brand.id, lists: [] as KlaviyoList[] };
            }
          });

          const listResults = await Promise.all(listFetchPromises);
          const klaviyoListsMap: Record<string, KlaviyoList[]> = {};
          listResults.forEach(({ brandId, lists }) => {
            klaviyoListsMap[brandId] = lists;
          });
          setKlaviyoListsByBrand(klaviyoListsMap);
        }
      }
    }
    setLoading(false);
  }, [user]);

  // Initial fetch
  useEffect(() => {
    fetchItems(true);
  }, [fetchItems]);

  // Wrapper for manual refresh (no loading skeleton)
  const refresh = useCallback(() => fetchItems(false), [fetchItems]);

  // Realtime subscription for campaign_queue
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('campaign_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_queue',
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch full item with brands join
            const { data: fullItem } = await supabase
              .from('campaign_queue')
              .select('*, brands(id, name, domain, primary_color)')
              .eq('id', payload.new.id)
              .single();
            if (fullItem) {
              setItems(prev => [fullItem as CampaignQueueItem, ...prev]);
              
              // Fetch presets for the new brand if not already loaded
              if (fullItem.brand_id && !presetsByBrand[fullItem.brand_id]) {
                const { data: presetsData } = await supabase
                  .from('segment_presets')
                  .select('*')
                  .eq('brand_id', fullItem.brand_id);
                
                if (presetsData && presetsData.length > 0) {
                  const mapped = presetsData.map(p => ({
                    id: p.id,
                    name: p.name,
                    included_segments: normalizeSegmentIds(p.included_segments),
                    excluded_segments: normalizeSegmentIds(p.excluded_segments),
                    is_default: p.is_default || false,
                  }));
                  mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
                  setPresetsByBrand(prev => ({ ...prev, [fullItem.brand_id]: mapped }));
                }
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            // Fetch full item with brands join to get complete data
            const { data: fullItem } = await supabase
              .from('campaign_queue')
              .select('*, brands(id, name, domain, primary_color)')
              .eq('id', payload.new.id)
              .single();
            if (fullItem) {
              setItems(prev => 
                prev.map(item => 
                  item.id === fullItem.id ? fullItem as CampaignQueueItem : item
                )
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, presetsByBrand]);

  // Realtime subscription for segment_presets
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('segment_presets_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'segment_presets',
        },
        async (payload) => {
          // Re-fetch presets for the affected brand
          const brandId = (payload.new as any)?.brand_id || (payload.old as any)?.brand_id;
          if (brandId) {
            const { data: presetsData } = await supabase
              .from('segment_presets')
              .select('*')
              .eq('brand_id', brandId);
            
            if (presetsData) {
              const mapped = presetsData.map(p => ({
                id: p.id,
                name: p.name,
                included_segments: normalizeSegmentIds(p.included_segments),
                excluded_segments: normalizeSegmentIds(p.excluded_segments),
                is_default: p.is_default || false,
              }));
              mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
              setPresetsByBrand(prev => ({ ...prev, [brandId]: mapped }));
            } else {
              // All presets deleted for this brand
              setPresetsByBrand(prev => {
                const next = { ...prev };
                delete next[brandId];
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const updateItem = async (id: string, updates: Record<string, unknown>) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating campaign queue item:', error);
      return false;
    }
    return true;
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting campaign queue item:', error);
      return false;
    }
    return true;
  };

  return {
    items,
    loading,
    presetsByBrand,
    klaviyoListsByBrand,
    refresh,
    updateItem,
    deleteItem,
  };
}
