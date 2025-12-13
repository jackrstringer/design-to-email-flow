import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, SocialLink } from '@/types/brand-assets';
import type { Json } from '@/integrations/supabase/types';

// Helper to extract domain from URL
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url.replace('www.', '').split('/')[0];
  }
}

// Type-safe conversion for JSON fields
function parseSocialLinks(json: Json | null): SocialLink[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as SocialLink[];
}

function parseAllLinks(json: Json | null): string[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as string[];
}

export function useBrands() {
  const [isLoading, setIsLoading] = useState(false);

  const findBrandByDomain = useCallback(async (domain: string): Promise<Brand | null> => {
    setIsLoading(true);
    try {
      const cleanDomain = extractDomain(domain);
      
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('domain', cleanDomain)
        .maybeSingle();

      if (error) throw error;

      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        domain: data.domain,
        websiteUrl: data.website_url || undefined,
        darkLogoUrl: data.dark_logo_url || undefined,
        darkLogoPublicId: data.dark_logo_public_id || undefined,
        lightLogoUrl: data.light_logo_url || undefined,
        lightLogoPublicId: data.light_logo_public_id || undefined,
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        accentColor: data.accent_color || undefined,
        socialLinks: parseSocialLinks(data.social_links),
        allLinks: parseAllLinks(data.all_links),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error finding brand:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createBrand = useCallback(async (brand: Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>): Promise<Brand | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('brands')
        .insert({
          name: brand.name,
          domain: brand.domain,
          website_url: brand.websiteUrl,
          dark_logo_url: brand.darkLogoUrl,
          dark_logo_public_id: brand.darkLogoPublicId,
          light_logo_url: brand.lightLogoUrl,
          light_logo_public_id: brand.lightLogoPublicId,
          primary_color: brand.primaryColor,
          secondary_color: brand.secondaryColor,
          accent_color: brand.accentColor,
          social_links: brand.socialLinks as unknown as Json,
          all_links: brand.allLinks as unknown as Json,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        domain: data.domain,
        websiteUrl: data.website_url || undefined,
        darkLogoUrl: data.dark_logo_url || undefined,
        darkLogoPublicId: data.dark_logo_public_id || undefined,
        lightLogoUrl: data.light_logo_url || undefined,
        lightLogoPublicId: data.light_logo_public_id || undefined,
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        accentColor: data.accent_color || undefined,
        socialLinks: parseSocialLinks(data.social_links),
        allLinks: parseAllLinks(data.all_links),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error creating brand:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>): Promise<Brand | null> => {
    setIsLoading(true);
    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.websiteUrl !== undefined) updateData.website_url = updates.websiteUrl;
      if (updates.darkLogoUrl !== undefined) updateData.dark_logo_url = updates.darkLogoUrl;
      if (updates.darkLogoPublicId !== undefined) updateData.dark_logo_public_id = updates.darkLogoPublicId;
      if (updates.lightLogoUrl !== undefined) updateData.light_logo_url = updates.lightLogoUrl;
      if (updates.lightLogoPublicId !== undefined) updateData.light_logo_public_id = updates.lightLogoPublicId;
      if (updates.primaryColor !== undefined) updateData.primary_color = updates.primaryColor;
      if (updates.secondaryColor !== undefined) updateData.secondary_color = updates.secondaryColor;
      if (updates.accentColor !== undefined) updateData.accent_color = updates.accentColor;
      if (updates.socialLinks !== undefined) updateData.social_links = updates.socialLinks as unknown as Json;
      if (updates.allLinks !== undefined) updateData.all_links = updates.allLinks as unknown as Json;

      const { data, error } = await supabase
        .from('brands')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        domain: data.domain,
        websiteUrl: data.website_url || undefined,
        darkLogoUrl: data.dark_logo_url || undefined,
        darkLogoPublicId: data.dark_logo_public_id || undefined,
        lightLogoUrl: data.light_logo_url || undefined,
        lightLogoPublicId: data.light_logo_public_id || undefined,
        primaryColor: data.primary_color,
        secondaryColor: data.secondary_color,
        accentColor: data.accent_color || undefined,
        socialLinks: parseSocialLinks(data.social_links),
        allLinks: parseAllLinks(data.all_links),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error updating brand:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    findBrandByDomain,
    createBrand,
    updateBrand,
  };
}
