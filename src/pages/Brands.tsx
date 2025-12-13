import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { BrandCard } from '@/components/BrandCard';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaignCounts, setCampaignCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBrands = async () => {
      setIsLoading(true);
      
      const { data: brandsData, error: brandsError } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: false });

      if (brandsError) {
        console.error('Error fetching brands:', brandsError);
        setIsLoading(false);
        return;
      }

      const mappedBrands: Brand[] = (brandsData || []).map(b => ({
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
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      }));

      setBrands(mappedBrands);

      // Fetch campaign counts for each brand
      const counts: Record<string, number> = {};
      for (const brand of mappedBrands) {
        const { count } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('brand_id', brand.id);
        counts[brand.id] = count || 0;
      }
      setCampaignCounts(counts);
      
      setIsLoading(false);
    };

    fetchBrands();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection 
        title="My Brands" 
        subtitle="Manage your brands and view campaign history"
      />
      
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">All Brands</h2>
          <Link to="/">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Brand
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No brands yet</p>
            <Link to="/">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create your first brand
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <BrandCard 
                key={brand.id} 
                brand={brand} 
                campaignCount={campaignCounts[brand.id] || 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
