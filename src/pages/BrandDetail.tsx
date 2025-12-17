import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { CampaignCard } from '@/components/CampaignCard';
import { BrandSettings } from '@/components/dashboard/BrandSettings';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Brand, Campaign, SocialLink, BrandTypography, HtmlFormattingRule } from '@/types/brand-assets';
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

function parseSocialIcons(json: Json | null): Brand['socialIcons'] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as Brand['socialIcons'];
}

function parseTypography(json: Json | null): BrandTypography | undefined {
  if (!json || typeof json !== 'object') return undefined;
  return json as unknown as BrandTypography;
}

function parseFormattingRules(json: Json | null): HtmlFormattingRule[] | undefined {
  if (!json || !Array.isArray(json)) return undefined;
  return json as unknown as HtmlFormattingRule[];
}

export default function BrandDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      backgroundColor: brandData.background_color || undefined,
      textPrimaryColor: brandData.text_primary_color || undefined,
      linkColor: brandData.link_color || undefined,
      socialLinks: parseSocialLinks(brandData.social_links),
      allLinks: parseAllLinks(brandData.all_links),
      footerHtml: brandData.footer_html || undefined,
      footerLogoUrl: brandData.footer_logo_url || undefined,
      footerLogoPublicId: brandData.footer_logo_public_id || undefined,
      socialIcons: parseSocialIcons(brandData.social_icons),
      footerConfigured: brandData.footer_configured || false,
      klaviyoApiKey: brandData.klaviyo_api_key || undefined,
      typography: parseTypography(brandData.typography),
      htmlFormattingRules: parseFormattingRules(brandData.html_formatting_rules),
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

  useEffect(() => {
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
      
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back link */}
        <Link to="/brands" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Brands
        </Link>

        {/* Brand Settings (inline - all brand info) */}
        <BrandSettings
          brand={brand}
          onBack={() => navigate('/brands')}
          onBrandChange={fetchBrandAndCampaigns}
        />

        {/* Campaigns Section */}
        <div className="mt-8 pt-8 border-t border-border/30">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Campaigns ({campaigns.length})</h2>
            <Link to="/">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border/50 rounded-lg">
              <p className="text-muted-foreground mb-4">No campaigns yet for this brand</p>
              <Link to="/">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first campaign
                </Button>
              </Link>
            </div>
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
    </div>
  );
}
