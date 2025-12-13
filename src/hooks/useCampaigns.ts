import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Campaign } from '@/types/brand-assets';
import { Json } from '@/integrations/supabase/types';

const parseBlocks = (json: Json | null): any[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as any[];
};

export const useCampaigns = () => {
  const [isLoading, setIsLoading] = useState(false);

  const getCampaignsByBrandId = async (brandId: string): Promise<Campaign[]> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching campaigns:', error);
      return [];
    }

    return (data || []).map(c => ({
      id: c.id,
      brandId: c.brand_id,
      name: c.name,
      originalImageUrl: c.original_image_url || undefined,
      generatedHtml: c.generated_html || undefined,
      thumbnailUrl: c.thumbnail_url || undefined,
      blocks: parseBlocks(c.blocks),
      status: c.status as Campaign['status'],
      klaviyoTemplateId: c.klaviyo_template_id || undefined,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  };

  const getCampaignById = async (id: string): Promise<Campaign | null> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    setIsLoading(false);

    if (error) {
      console.error('Error fetching campaign:', error);
      return null;
    }

    return {
      id: data.id,
      brandId: data.brand_id,
      name: data.name,
      originalImageUrl: data.original_image_url || undefined,
      generatedHtml: data.generated_html || undefined,
      thumbnailUrl: data.thumbnail_url || undefined,
      blocks: parseBlocks(data.blocks),
      status: data.status as Campaign['status'],
      klaviyoTemplateId: data.klaviyo_template_id || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  };

  const createCampaign = async (
    campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Campaign | null> => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        brand_id: campaign.brandId,
        name: campaign.name,
        original_image_url: campaign.originalImageUrl,
        generated_html: campaign.generatedHtml,
        thumbnail_url: campaign.thumbnailUrl,
        blocks: campaign.blocks as Json,
        status: campaign.status,
        klaviyo_template_id: campaign.klaviyoTemplateId,
      })
      .select()
      .single();

    setIsLoading(false);

    if (error) {
      console.error('Error creating campaign:', error);
      return null;
    }

    return {
      id: data.id,
      brandId: data.brand_id,
      name: data.name,
      originalImageUrl: data.original_image_url || undefined,
      generatedHtml: data.generated_html || undefined,
      thumbnailUrl: data.thumbnail_url || undefined,
      blocks: parseBlocks(data.blocks),
      status: data.status as Campaign['status'],
      klaviyoTemplateId: data.klaviyo_template_id || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  };

  const updateCampaign = async (
    id: string,
    updates: Partial<Campaign>
  ): Promise<Campaign | null> => {
    setIsLoading(true);

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.originalImageUrl !== undefined) updateData.original_image_url = updates.originalImageUrl;
    if (updates.generatedHtml !== undefined) updateData.generated_html = updates.generatedHtml;
    if (updates.thumbnailUrl !== undefined) updateData.thumbnail_url = updates.thumbnailUrl;
    if (updates.blocks !== undefined) updateData.blocks = updates.blocks as Json;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.klaviyoTemplateId !== undefined) updateData.klaviyo_template_id = updates.klaviyoTemplateId;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    setIsLoading(false);

    if (error) {
      console.error('Error updating campaign:', error);
      return null;
    }

    return {
      id: data.id,
      brandId: data.brand_id,
      name: data.name,
      originalImageUrl: data.original_image_url || undefined,
      generatedHtml: data.generated_html || undefined,
      thumbnailUrl: data.thumbnail_url || undefined,
      blocks: parseBlocks(data.blocks),
      status: data.status as Campaign['status'],
      klaviyoTemplateId: data.klaviyo_template_id || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  };

  const deleteCampaign = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    setIsLoading(false);

    if (error) {
      console.error('Error deleting campaign:', error);
      return false;
    }

    return true;
  };

  return {
    isLoading,
    getCampaignsByBrandId,
    getCampaignById,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  };
};
