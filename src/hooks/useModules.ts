import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Module, ModuleContent, ModuleVisuals, ModuleLayout } from '@/types/modules';

interface RawModule {
  id: string;
  campaign_id: string;
  brand_id: string;
  module_index: number;
  module_type: string;
  module_type_confidence: number;
  image_url: string;
  thumbnail_url: string | null;
  y_start: number;
  y_end: number;
  width: number;
  height: number;
  content: unknown;
  visuals: unknown;
  layout: unknown;
  composition_notes: string | null;
  quality_score: number;
  is_reference_quality: boolean;
  embedding: unknown;
  created_at: string;
  updated_at: string;
}

const parseModule = (raw: RawModule): Module => ({
  id: raw.id,
  campaign_id: raw.campaign_id,
  brand_id: raw.brand_id,
  module_index: raw.module_index,
  module_type: raw.module_type,
  module_type_confidence: raw.module_type_confidence,
  image_url: raw.image_url,
  thumbnail_url: raw.thumbnail_url || undefined,
  y_start: raw.y_start,
  y_end: raw.y_end,
  width: raw.width,
  height: raw.height,
  content: (raw.content as ModuleContent) || {},
  visuals: (raw.visuals as ModuleVisuals) || {},
  layout: (raw.layout as ModuleLayout) || {},
  composition_notes: raw.composition_notes || undefined,
  quality_score: raw.quality_score || 0,
  is_reference_quality: raw.is_reference_quality || false,
  created_at: raw.created_at,
  updated_at: raw.updated_at,
});

export const useModules = () => {
  const [isLoading, setIsLoading] = useState(false);

  const getModulesByBrandId = useCallback(async (brandId: string): Promise<Module[]> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching modules:', error);
      return [];
    }

    return (data || []).map((m: any) => parseModule(m));
  }, []);

  const getModulesByCampaignId = useCallback(async (campaignId: string): Promise<Module[]> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('module_index', { ascending: true });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching modules:', error);
      return [];
    }

    return (data || []).map((m: any) => parseModule(m));
  }, []);

  const getModuleById = useCallback(async (id: string): Promise<Module | null> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('id', id)
      .single();

    setIsLoading(false);

    if (error) {
      console.error('Error fetching module:', error);
      return null;
    }

    return parseModule(data as any);
  }, []);

  const updateModule = useCallback(async (
    id: string,
    updates: Partial<Pick<Module, 'module_type' | 'content' | 'visuals' | 'layout' | 'composition_notes' | 'quality_score' | 'is_reference_quality'>>
  ): Promise<Module | null> => {
    setIsLoading(true);

    const updateData: Record<string, unknown> = {};
    if (updates.module_type !== undefined) updateData.module_type = updates.module_type;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.visuals !== undefined) updateData.visuals = updates.visuals;
    if (updates.layout !== undefined) updateData.layout = updates.layout;
    if (updates.composition_notes !== undefined) updateData.composition_notes = updates.composition_notes;
    if (updates.quality_score !== undefined) updateData.quality_score = updates.quality_score;
    if (updates.is_reference_quality !== undefined) updateData.is_reference_quality = updates.is_reference_quality;

    const { data, error } = await supabase
      .from('modules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    setIsLoading(false);

    if (error) {
      console.error('Error updating module:', error);
      return null;
    }

    return parseModule(data as any);
  }, []);

  const deleteModule = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    
    const { error } = await supabase
      .from('modules')
      .delete()
      .eq('id', id);

    setIsLoading(false);

    if (error) {
      console.error('Error deleting module:', error);
      return false;
    }

    return true;
  }, []);

  const getModulesByType = useCallback(async (brandId: string, moduleType: string): Promise<Module[]> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('brand_id', brandId)
      .eq('module_type', moduleType)
      .order('quality_score', { ascending: false });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching modules by type:', error);
      return [];
    }

    return (data || []).map((m: any) => parseModule(m));
  }, []);

  const getReferenceQualityModules = useCallback(async (brandId: string): Promise<Module[]> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('brand_id', brandId)
      .eq('is_reference_quality', true)
      .order('quality_score', { ascending: false });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching reference modules:', error);
      return [];
    }

    return (data || []).map((m: any) => parseModule(m));
  }, []);

  return {
    isLoading,
    getModulesByBrandId,
    getModulesByCampaignId,
    getModuleById,
    updateModule,
    deleteModule,
    getModulesByType,
    getReferenceQualityModules,
  };
};
