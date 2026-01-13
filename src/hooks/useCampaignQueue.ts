import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
  status: 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed';
  processing_step: string | null;
  processing_percent: number;
  error_message: string | null;
  retry_from_step: string | null;
  retry_count: number;
  klaviyo_template_id: string | null;
  klaviyo_campaign_id: string | null;
  klaviyo_campaign_url: string | null;
  sent_to_klaviyo_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined brand data
  brands?: { id: string; name: string } | null;
}

export function useCampaignQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<CampaignQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('campaign_queue')
      .select('*, brands(id, name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaign queue:', error);
    } else {
      setItems((data as CampaignQueueItem[]) || []);
    }
    setLoading(false);
  }, [user]);

  // Initial fetch
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Realtime subscription
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
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [payload.new as CampaignQueueItem, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => 
              prev.map(item => 
                item.id === payload.new.id ? payload.new as CampaignQueueItem : item
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
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
    refresh: fetchItems,
    updateItem,
    deleteItem,
  };
}
