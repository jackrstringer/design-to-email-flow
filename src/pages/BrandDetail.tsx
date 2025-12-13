import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { CampaignCard } from '@/components/CampaignCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  ExternalLink, 
  Loader2,
  Image as ImageIcon 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Brand, Campaign, SocialLink } from '@/types/brand-assets';
import { Json } from '@/integrations/supabase/types';

const parseSocialLinks = (json: Json | null): SocialLink[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as SocialLink[];
};

const parseAllLinks = (json: Json | null): string[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as string[];
};

const parseBlocks = (json: Json | null): any[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as any[];
};

export default function BrandDetail() {
  const { id } = useParams<{ id: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBrandAndCampaigns = async () => {
      if (!id) return;
      
      setIsLoading(true);

      // Fetch brand
      const { data: brandData, error: brandError } = await supabase
        .from('brands')
        .select('*')
        .eq('id', id)
        .single();

      if (brandError) {
        console.error('Error fetching brand:', brandError);
        setIsLoading(false);
        return;
      }

      const mappedBrand: Brand = {
        id: brandData.id,
        name: brandData.name,
        domain: brandData.domain,
        websiteUrl: brandData.website_url || undefined,
        darkLogoUrl: brandData.dark_logo_url || undefined,
        darkLogoPublicId: brandData.dark_logo_public_id || undefined,
        lightLogoUrl: brandData.light_logo_url || undefined,
        lightLogoPublicId: brandData.light_logo_public_id || undefined,
        primaryColor: brandData.primary_color,
        secondaryColor: brandData.secondary_color,
        accentColor: brandData.accent_color || undefined,
        socialLinks: parseSocialLinks(brandData.social_links),
        allLinks: parseAllLinks(brandData.all_links),
        createdAt: brandData.created_at,
        updatedAt: brandData.updated_at,
      };

      setBrand(mappedBrand);

      // Fetch campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('brand_id', id)
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

    fetchBrandAndCampaigns();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-muted-foreground">Brand not found</p>
          <Link to="/brands">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Brands
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Brand Header */}
      <div className="hero-gradient">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link to="/brands" className="inline-flex items-center text-primary-foreground/80 hover:text-primary-foreground mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Brands
          </Link>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {brand.darkLogoUrl ? (
                <img 
                  src={brand.darkLogoUrl} 
                  alt={brand.name} 
                  className="w-16 h-16 object-contain rounded-lg bg-white p-2"
                />
              ) : (
                <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-primary-foreground" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-primary-foreground">{brand.name}</h1>
                <a 
                  href={brand.websiteUrl || `https://${brand.domain}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-primary-foreground/80 hover:text-primary-foreground text-sm"
                >
                  {brand.domain}
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit Brand
              </Button>
              <Button variant="secondary" size="sm">
                Connect Klaviyo
              </Button>
            </div>
          </div>

          {/* Brand Colors */}
          <div className="flex items-center gap-2 mt-4">
            <div 
              className="w-6 h-6 rounded-full border-2 border-white/30" 
              style={{ backgroundColor: brand.primaryColor }}
              title="Primary"
            />
            <div 
              className="w-6 h-6 rounded-full border-2 border-white/30" 
              style={{ backgroundColor: brand.secondaryColor }}
              title="Secondary"
            />
            {brand.accentColor && (
              <div 
                className="w-6 h-6 rounded-full border-2 border-white/30" 
                style={{ backgroundColor: brand.accentColor }}
                title="Accent"
              />
            )}
          </div>
        </div>
      </div>

      {/* Campaigns Section */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Campaigns</h2>
          <Link to="/">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No campaigns yet for this brand</p>
            <Link to="/">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create your first campaign
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </div>
    </div>
  );
}
