import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Campaign } from '@/types/brand-assets';
import { Json } from '@/integrations/supabase/types';
import { CampaignCard } from '@/components/CampaignCard';
import { BrandIdentityCompact } from '@/components/brand/BrandIdentityCompact';
import { Separator } from '@/components/ui/separator';
import type { BrandContextData } from '@/layouts/BrandLayout';

const parseBlocks = (json: Json | null): any[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as any[];
};

export default function BrandOverview() {
  const { brand, refetchBrand } = useOutletContext<BrandContextData>();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCampaigns = async () => {
    if (!brand?.id) return;
    
    setIsLoading(true);

    const { data: campaignsData, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false });

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
    } else {
      const mappedCampaigns: Campaign[] = (campaignsData || []).map(c => ({
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
      setCampaigns(mappedCampaigns);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, [brand?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Compact Brand Identity */}
      <BrandIdentityCompact brand={brand} />

      <Separator />

      {/* Campaigns Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Campaigns ({campaigns.length})
          </h2>
          <Link to="/">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border/50 rounded-lg">
            <p className="text-muted-foreground mb-4">No campaigns yet for this brand</p>
            <Link to="/">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create your first campaign
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <CampaignCard 
                key={campaign.id} 
                campaign={campaign}
                brandName={brand.name}
                brandDomain={brand.domain}
                brandLogoUrl={brand.darkLogoUrl}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
