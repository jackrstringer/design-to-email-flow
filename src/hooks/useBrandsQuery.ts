import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Brand, SocialLink } from '@/types/brand-assets';
import { Json } from '@/integrations/supabase/types';

const parseSocialLinks = (json: Json | null): SocialLink[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as SocialLink[];
};

const parseAllLinks = (json: Json | null): string[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as string[];
};

export interface BrandWithCounts extends Brand {
  campaignCount?: number;
}

// Shared brands query - used across Brands page, Segments page, etc.
export function useBrandsQuery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brands', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const brands: Brand[] = (data || []).map((b) => ({
        id: b.id,
        name: b.name,
        domain: b.domain,
        websiteUrl: b.website_url || undefined,
        darkLogoUrl: b.dark_logo_url || undefined,
        darkLogoPublicId: b.dark_logo_public_id || undefined,
        lightLogoUrl: b.light_logo_url || undefined,
        lightLogoPublicId: b.light_logo_public_id || undefined,
        primaryColor: b.primary_color,
        secondaryColor: b.secondary_color,
        accentColor: b.accent_color || undefined,
        socialLinks: parseSocialLinks(b.social_links),
        allLinks: parseAllLinks(b.all_links),
        footerConfigured: b.footer_configured || false,
        klaviyoApiKey: b.klaviyo_api_key || undefined,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      }));

      return brands;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes - data is fresh for 5 min
  });
}

// Campaign counts query - separate to avoid blocking brand list
export function useCampaignCountsQuery(brandIds: string[]) {
  return useQuery({
    queryKey: ['campaign-counts', brandIds],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      
      // Fetch counts in parallel
      await Promise.all(
        brandIds.map(async (brandId) => {
          const { count } = await supabase
            .from('campaigns')
            .select('*', { count: 'exact', head: true })
            .eq('brand_id', brandId);
          counts[brandId] = count || 0;
        })
      );

      return counts;
    },
    enabled: brandIds.length > 0,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

// Hook to add a brand to the cache optimistically
export function useAddBrandToCache() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return (brand: Brand) => {
    queryClient.setQueryData<Brand[]>(['brands', user?.id], (old) => {
      if (!old) return [brand];
      return [brand, ...old];
    });
  };
}
