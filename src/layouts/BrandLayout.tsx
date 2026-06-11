import { useEffect, useState } from 'react';
import { useParams, Outlet, Link, NavLink } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Brand, SocialLink, BrandTypography, HtmlFormattingRule } from '@/types/brand-assets';
import { BrandLinkPreferences } from '@/types/link-intelligence';
import { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const parseSocialLinks = (json: Json | null): SocialLink[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as SocialLink[];
};

const parseAllLinks = (json: Json | null): string[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as string[];
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

function parseLinkPreferences(json: Json | null): BrandLinkPreferences | undefined {
  if (!json || typeof json !== 'object') return undefined;
  return json as unknown as BrandLinkPreferences;
}

const tabs = [
  { label: 'Overview', path: '' },
  { label: 'Knowledge', path: 'knowledge' },
  { label: 'Links', path: 'links' },
  { label: 'Email', path: 'email' },
  { label: 'Integrations', path: 'integrations' },
];

export interface BrandContextData {
  brand: Brand;
  refetchBrand: () => void;
  isLoading: boolean;
}

export function BrandLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBrand = async () => {
    if (!id) return;

    setIsLoading(true);
    setFetchError(false);

    const { data: brandData, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('id', id)
      .single();

    if (brandError) {
      console.error('Error fetching brand:', brandError);
      // PGRST116 = row not found; anything else is a real fetch error
      if (brandError.code !== 'PGRST116') {
        setFetchError(true);
      }
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
      klaviyoKeySet: brandData.klaviyo_key_set,
      typography: parseTypography(brandData.typography),
      htmlFormattingRules: parseFormattingRules(brandData.html_formatting_rules),
      clickupKeySet: brandData.clickup_key_set,
      clickupWorkspaceId: brandData.clickup_workspace_id || undefined,
      clickupListId: brandData.clickup_list_id || undefined,
      linkPreferences: parseLinkPreferences(brandData.link_preferences),
      createdAt: brandData.created_at,
      updatedAt: brandData.updated_at,
    };

    setBrand(mappedBrand);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBrand();
  }, [id]);

  const handleReanalyze = async () => {
    if (!brand?.websiteUrl) {
      toast.error('No website URL to analyze');
      return;
    }

    setIsReanalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl: brand.websiteUrl }
      });

      if (error) throw error;

      const updates: any = {};
      
      if (data?.colors) {
        updates.primary_color = data.colors.primary || brand.primaryColor;
        updates.secondary_color = data.colors.secondary || brand.secondaryColor;
        updates.accent_color = data.colors.accent || null;
        updates.background_color = data.colors.background || null;
        updates.text_primary_color = data.colors.textPrimary || null;
        updates.link_color = data.colors.link || null;
      }

      if (data?.typography || data?.fonts || data?.spacing || data?.components) {
        updates.typography = {
          ...(data.typography || {}),
          fonts: data.fonts || [],
          spacing: data.spacing || null,
          components: data.components || null,
        };
      }

      if (data?.socialLinks) {
        updates.social_links = data.socialLinks;
      }

      if (data?.allLinks) {
        updates.all_links = data.allLinks;
      }

      const { error: updateError } = await supabase
        .from('brands')
        .update(updates)
        .eq('id', brand.id);

      if (updateError) throw updateError;

      toast.success('Brand info refreshed');
      fetchBrand();
    } catch (error) {
      console.error('Error re-analyzing brand:', error);
      toast.error('Failed to re-analyze brand');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!brand) return;
    if (!confirm(`Are you sure you want to delete "${brand.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', brand.id);

      if (error) throw error;

      toast.success('Brand deleted');
      navigate('/brands');
    } catch (error) {
      console.error('Error deleting brand:', error);
      toast.error('Failed to delete brand');
    } finally {
      setIsDeleting(false);
    }
  };

  // Initial load: skeleton header + tab bar matching the final layout
  if (isLoading && !brand) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-5xl mx-auto px-8 py-10">
          <Skeleton className="h-4 w-28" />

          <div className="flex items-center gap-4 mt-6">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>

          <div className="flex gap-1 border-b mt-8 pb-px">
            {tabs.map(tab => (
              <div key={tab.path} className="px-4 py-2">
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Fetch error or brand not found
  if (!brand) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-5xl mx-auto px-8 py-10">
          <Link to="/brands" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to brands
          </Link>

          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{fetchError ? "Couldn't load this brand" : 'Brand not found'}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>
                {fetchError
                  ? 'Something went wrong while loading the brand. Try again.'
                  : 'This brand may have been deleted, or the link is out of date.'}
              </span>
              <div className="flex gap-2">
                {fetchError && (
                  <Button variant="outline" size="sm" onClick={fetchBrand}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate('/brands')}>
                  Back to brands
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-5xl mx-auto px-8 py-10">
        {/* Back link */}
        <Link to="/brands" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to brands
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-4">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {brand.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-semibold">{brand.name}</h1>
              <p className="text-sm text-muted-foreground">{brand.domain}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleReanalyze}
              disabled={isReanalyzing || !brand.websiteUrl}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
              {isReanalyzing ? 'Analyzing...' : 'Re-analyze'}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDeleteBrand}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>

        {/* Submenu Navigation */}
        <nav className="flex gap-1 border-b mt-8">
          {tabs.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path === '' ? `/brands/${id}` : `/brands/${id}/${tab.path}`}
              end={tab.path === ''}
              className={({ isActive }) => cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive 
                  ? "border-primary text-foreground" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="mt-8">
          <Outlet context={{ brand, refetchBrand: fetchBrand, isLoading } satisfies BrandContextData} />
        </div>
      </div>
    </div>
  );
}
