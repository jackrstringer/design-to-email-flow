import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

// Brand data needed for expanded row panel
export interface BrandData {
  footerHtml: string | null;
  allLinks: string[];
  domain: string | null;
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

interface CampaignQueueData {
  items: CampaignQueueItem[];
  presetsByBrand: Record<string, SegmentPreset[]>;
  klaviyoListsByBrand: Record<string, KlaviyoList[]>;
  brandDataByBrand: Record<string, BrandData>;
}

async function fetchCampaignQueueData(): Promise<CampaignQueueData> {
  const { data, error } = await supabase
    .from('campaign_queue')
    .select('*, brands(id, name, domain, primary_color)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaign queue:', error);
    throw error;
  }

  const items = (data as CampaignQueueItem[]) || [];
  let presetsByBrand: Record<string, SegmentPreset[]> = {};
  let klaviyoListsByBrand: Record<string, KlaviyoList[]> = {};
  let brandDataByBrand: Record<string, BrandData> = {};

  // Extract unique brand IDs and fetch all segment presets
  const brandIds = [...new Set(data?.filter(d => d.brand_id).map(d => d.brand_id) || [])];

  if (brandIds.length > 0) {
    // Fetch presets, brand data, and Klaviyo lists in parallel
    const [presetsResult, brandsResult, footersResult] = await Promise.all([
      supabase.from('segment_presets').select('*').in('brand_id', brandIds),
      supabase.from('brands').select('id, klaviyo_api_key, footer_html, all_links, domain').in('id', brandIds),
      supabase.from('brand_footers').select('brand_id, html, is_primary').in('brand_id', brandIds)
    ]);

    // Process presets
    if (presetsResult.data) {
      const grouped = presetsResult.data.reduce((acc, p) => {
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

      Object.keys(grouped).forEach(brandId => {
        grouped[brandId].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
      });

      presetsByBrand = grouped;
    }

    // Process brand data (footer, links, domain)
    if (brandsResult.data) {
      for (const brand of brandsResult.data) {
        // Find footer - primary first, then most recent from brand_footers, then legacy footer_html
        let footerHtml: string | null = null;
        const brandFooters = footersResult.data?.filter(f => f.brand_id === brand.id) || [];
        const primaryFooter = brandFooters.find(f => f.is_primary);

        if (primaryFooter?.html) {
          footerHtml = primaryFooter.html;
        } else if (brandFooters.length > 0) {
          footerHtml = brandFooters[0].html;
        } else if (brand.footer_html) {
          footerHtml = brand.footer_html;
        }

        brandDataByBrand[brand.id] = {
          footerHtml,
          allLinks: Array.isArray(brand.all_links) ? brand.all_links as string[] : [],
          domain: brand.domain || null,
        };
      }

      // Prefetch Klaviyo lists for brands with API keys
      const brandsWithKeys = brandsResult.data.filter(b => b.klaviyo_api_key);
      if (brandsWithKeys.length > 0) {
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
        listResults.forEach(({ brandId, lists }) => {
          klaviyoListsByBrand[brandId] = lists;
        });
      }
    }
  }

  return { items, presetsByBrand, klaviyoListsByBrand, brandDataByBrand };
}

export function useCampaignQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Main campaign queue query - cached and persisted
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['campaign-queue', user?.id],
    queryFn: fetchCampaignQueueData,
    enabled: !!user,
    staleTime: 1000 * 60 * 2, // 2 minutes before considered stale
  });

  // Fetch user zoom level
  const { data: userZoomLevel = 39 } = useQuery({
    queryKey: ['user-zoom-level', user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('queue_zoom_level')
        .eq('id', user!.id)
        .single();
      return profile?.queue_zoom_level ?? 39;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  // Realtime subscription for campaign_queue - updates React Query cache directly
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
              queryClient.setQueryData<CampaignQueueData>(
                ['campaign-queue', user.id],
                (old) => {
                  if (!old) return old;
                  
                  // Fetch presets for the new brand if not already loaded
                  if (fullItem.brand_id && !old.presetsByBrand[fullItem.brand_id]) {
                    // Trigger a background fetch for brand data
                    supabase
                      .from('segment_presets')
                      .select('*')
                      .eq('brand_id', fullItem.brand_id)
                      .then(({ data: presetsData }) => {
                        if (presetsData && presetsData.length > 0) {
                          const mapped = presetsData.map(p => ({
                            id: p.id,
                            name: p.name,
                            included_segments: normalizeSegmentIds(p.included_segments),
                            excluded_segments: normalizeSegmentIds(p.excluded_segments),
                            is_default: p.is_default || false,
                          }));
                          mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
                          
                          queryClient.setQueryData<CampaignQueueData>(
                            ['campaign-queue', user.id],
                            (current) => current ? {
                              ...current,
                              presetsByBrand: { ...current.presetsByBrand, [fullItem.brand_id!]: mapped }
                            } : current
                          );
                        }
                      });
                  }
                  
                  return {
                    ...old,
                    items: [fullItem as CampaignQueueItem, ...old.items],
                  };
                }
              );
            }
          } else if (payload.eventType === 'UPDATE') {
            // Fetch full item with brands join to get complete data
            const { data: fullItem } = await supabase
              .from('campaign_queue')
              .select('*, brands(id, name, domain, primary_color)')
              .eq('id', payload.new.id)
              .single();
              
            if (fullItem) {
              queryClient.setQueryData<CampaignQueueData>(
                ['campaign-queue', user.id],
                (old) => old ? {
                  ...old,
                  items: old.items.map(item =>
                    item.id === fullItem.id ? fullItem as CampaignQueueItem : item
                  ),
                } : old
              );
            }
          } else if (payload.eventType === 'DELETE') {
            queryClient.setQueryData<CampaignQueueData>(
              ['campaign-queue', user.id],
              (old) => old ? {
                ...old,
                items: old.items.filter(item => item.id !== payload.old.id),
              } : old
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

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
          const brandId = (payload.new as Record<string, unknown>)?.brand_id || 
                         (payload.old as Record<string, unknown>)?.brand_id;
          if (brandId && typeof brandId === 'string') {
            const { data: presetsData } = await supabase
              .from('segment_presets')
              .select('*')
              .eq('brand_id', brandId);

            queryClient.setQueryData<CampaignQueueData>(
              ['campaign-queue', user.id],
              (old) => {
                if (!old) return old;
                
                if (presetsData && presetsData.length > 0) {
                  const mapped = presetsData.map(p => ({
                    id: p.id,
                    name: p.name,
                    included_segments: normalizeSegmentIds(p.included_segments),
                    excluded_segments: normalizeSegmentIds(p.excluded_segments),
                    is_default: p.is_default || false,
                  }));
                  mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
                  
                  return {
                    ...old,
                    presetsByBrand: { ...old.presetsByBrand, [brandId]: mapped }
                  };
                } else {
                  // All presets deleted for this brand
                  const { [brandId]: _, ...rest } = old.presetsByBrand;
                  return { ...old, presetsByBrand: rest };
                }
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const updateItem = useCallback(async (id: string, updates: Record<string, unknown>) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating campaign queue item:', error);
      return false;
    }
    return true;
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting campaign queue item:', error);
      return false;
    }
    return true;
  }, []);

  return {
    items: data?.items ?? [],
    loading: isLoading,
    presetsByBrand: data?.presetsByBrand ?? {},
    klaviyoListsByBrand: data?.klaviyoListsByBrand ?? {},
    brandDataByBrand: data?.brandDataByBrand ?? {},
    userZoomLevel,
    refresh: refetch,
    updateItem,
    deleteItem,
  };
}
