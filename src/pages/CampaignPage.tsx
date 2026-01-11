import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CampaignStudio } from '@/components/CampaignStudio';
import type { ProcessedSlice } from '@/types/slice';
import type { Brand } from '@/types/brand-assets';
import type { BrandFooter } from '@/components/FooterSelector';

interface LocationState {
  imageUrl: string;
  brand: Brand;
  includeFooter: boolean;
  slices: Array<{
    imageUrl: string;
    startPercent?: number;
    endPercent?: number;
    width?: number;
    height?: number;
    type: 'image' | 'html';
    altText: string;
    link: string | null;
    html?: string | null;
  }>;
  figmaDesignData?: any;
  earlyGenerationSessionKey?: string; // Session key for early SL/PT lookup
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [slices, setSlices] = useState<ProcessedSlice[]>([]);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [figmaDesignData, setFigmaDesignData] = useState<any>(null);
  
  // Footer versioning state
  const [savedFooters, setSavedFooters] = useState<BrandFooter[]>([]);
  const [initialFooterHtml, setInitialFooterHtml] = useState<string | undefined>();
  const [initialFooterId, setInitialFooterId] = useState<string | null>(null);
  
  // Early generation session key (for SL/PT lookup)
  const [earlyGenerationSessionKey, setEarlyGenerationSessionKey] = useState<string | null>(null);
  
  // Klaviyo lists state
  const [klaviyoLists, setKlaviyoLists] = useState<{ id: string; name: string }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (state?.slices && state.slices.length > 0) {
      // Initialize from navigation state with processed slices
      setOriginalImageUrl(state.imageUrl);
      setBrand(state.brand);
      setFigmaDesignData(state.figmaDesignData || null);
      setEarlyGenerationSessionKey(state.earlyGenerationSessionKey || null);
      
      const processedSlices: ProcessedSlice[] = state.slices.map((slice: any) => ({
        imageUrl: slice.imageUrl,
        altText: slice.altText || '',
        link: slice.link || null,
        isClickable: slice.isClickable ?? !!slice.link,
        type: slice.type || 'image',
        htmlContent: slice.htmlContent || slice.html || undefined,
        linkVerified: slice.linkVerified,
        linkWarning: slice.linkWarning,
        column: slice.column,
        totalColumns: slice.totalColumns,
        rowIndex: slice.rowIndex,
      }));
      setSlices(processedSlices);
      setIsLoading(false);
      
      // Fetch all footers for the brand
      if (state.brand?.id) {
        fetchBrandFooters(state.brand.id);
      }
    } else if (id) {
      // Load from database if no state
      loadCampaign();
    } else {
      navigate('/');
    }
  }, [id, state]);

  // Fetch ALL footers for the brand (not just primary)
  const fetchBrandFooters = async (brandId: string) => {
    try {
      const { data, error } = await supabase
        .from('brand_footers')
        .select('*')
        .eq('brand_id', brandId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching footers:', error);
        return;
      }

      if (data && data.length > 0) {
        setSavedFooters(data as BrandFooter[]);
        
        // Set primary footer as initial
        const primaryFooter = data.find(f => f.is_primary);
        if (primaryFooter) {
          setInitialFooterHtml(primaryFooter.html);
          setInitialFooterId(primaryFooter.id);
        } else {
          // Use first footer if no primary
          setInitialFooterHtml(data[0].html);
          setInitialFooterId(data[0].id);
        }
      }
    } catch (err) {
      console.log('No footers found');
    }
  };

  // Fetch Klaviyo lists when brand loads
  const fetchKlaviyoLists = async (apiKey: string) => {
    setIsLoadingLists(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-klaviyo-lists', {
        body: { klaviyoApiKey: apiKey }
      });

      if (error) throw error;

      if (data?.transientError) {
        setKlaviyoLists([]);
        setSelectedListId(null);
        toast.error(data.error || 'Unable to load segments right now. Please try again.');
        return;
      }

      if (data?.lists && data.lists.length > 0) {
        setKlaviyoLists(data.lists);

        // Auto-select "Newsletter" if exists, otherwise first list
        const newsletterList = data.lists.find((l: any) =>
          l.name.toLowerCase().includes('newsletter')
        );
        setSelectedListId(newsletterList?.id || data.lists[0].id);
      } else {
        setKlaviyoLists([]);
        setSelectedListId(null);
      }
    } catch (err) {
      console.error('Error fetching Klaviyo lists:', err);
      toast.error('Unable to load segments right now. Please try again.');
    } finally {
      setIsLoadingLists(false);
    }
  };

  // Fetch lists when brand is set
  useEffect(() => {
    const apiKey = (brand as any)?.klaviyoApiKey || (brand as any)?.klaviyo_api_key;
    if (apiKey) {
      fetchKlaviyoLists(apiKey);
    }
  }, [brand]);

  // Save new footer version
  const handleSaveFooter = async (name: string, html: string) => {
    if (!brand?.id) return;
    
    const { data, error } = await supabase
      .from('brand_footers')
      .insert({
        brand_id: brand.id,
        name,
        html,
        is_primary: false,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to save footer');
      throw error;
    }

    // Refresh footers list
    await fetchBrandFooters(brand.id);
  };

  const loadCampaign = async () => {
    if (!id) return;
    
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('*, brands(*)')
        .eq('id', id)
        .single();

      if (error) throw error;

      setOriginalImageUrl(campaign.original_image_url || '');
      
      // Parse brand data and fetch footers
      if (campaign.brands) {
        const brandData = campaign.brands as unknown as Brand;
        setBrand(brandData);
        fetchBrandFooters(brandData.id);
      }

      // Parse blocks from campaign, preserving all metadata
      const blocks = campaign.blocks as Array<any> || [];
      if (blocks.length > 0) {
        setSlices(blocks.map((block: any) => ({
          imageUrl: block.imageUrl || campaign.original_image_url,
          altText: block.altText || '',
          link: block.link || null,
          isClickable: block.isClickable ?? !!block.link,
          type: block.type || 'image',
          htmlContent: block.htmlContent || block.html,
          linkVerified: block.linkVerified,
          linkWarning: block.linkWarning,
          column: block.column,
          totalColumns: block.totalColumns,
          rowIndex: block.rowIndex,
        })));
      } else {
        setSlices([{
          imageUrl: campaign.original_image_url || '',
          altText: '',
          link: null,
          isClickable: false,
          type: 'image',
        }]);
      }
    } catch (error) {
      console.error('Error loading campaign:', error);
      toast.error('Failed to load campaign');
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConvertToHtml = async (index: number) => {
    const slice = slices[index];
    try {
      const { data, error } = await supabase.functions.invoke('generate-slice-html', {
        body: {
          sliceDataUrl: slice.imageUrl,
          brandUrl: brand?.websiteUrl || brand?.domain,
          sliceIndex: index,
          totalSlices: slices.length,
        }
      });

      if (error) throw error;

      const updatedSlices = [...slices];
      updatedSlices[index] = {
        ...updatedSlices[index],
        type: 'html',
        htmlContent: data.htmlContent,
      };
      setSlices(updatedSlices);
    } catch (error) {
      console.error('Error converting to HTML:', error);
      toast.error('Failed to convert slice to HTML');
    }
  };

  const handleCreateTemplate = async (footer?: string) => {
    const apiKey = (brand as any)?.klaviyoApiKey || (brand as any)?.klaviyo_api_key;
    if (!apiKey) {
      toast.error('No Klaviyo API key configured for this brand');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          slices,
          klaviyoApiKey: apiKey,
          templateName: `Campaign ${new Date().toLocaleDateString()}`,
          footerHtml: footer,
        }
      });

      if (error) throw error;

      setTemplateId(data.templateId);
      toast.success('Template created successfully!');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateCampaign = async (footer?: string) => {
    const apiKey = (brand as any)?.klaviyoApiKey || (brand as any)?.klaviyo_api_key;
    if (!apiKey) {
      toast.error('No Klaviyo API key configured for this brand');
      return;
    }

    // Navigate to send page with all campaign data
    navigate(`/campaign/${id}/send`, {
      state: {
        slices,
        footerHtml: footer,
        brandName: (brand as any)?.name,
        brandDomain: (brand as any)?.domain,
        brandId: (brand as any)?.id,
        klaviyoApiKey: apiKey,
        klaviyoLists,
        selectedListId,
        earlyGenerationSessionKey, // Pass for early SL/PT lookup
      }
    });
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleReset = () => {
    setTemplateId(null);
    setCampaignId(null);
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!originalImageUrl) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Campaign not found</p>
      </div>
    );
  }

  // Extract brand links from allLinks/all_links JSON field (handles both camelCase and snake_case)
  const rawLinks = (brand as any)?.allLinks || (brand as any)?.all_links;
  const brandLinks = Array.isArray(rawLinks) ? rawLinks as string[] : [];

  return (
    <CampaignStudio
      slices={slices}
      onSlicesChange={setSlices}
      originalImageUrl={originalImageUrl}
      brandUrl={brand?.websiteUrl || brand?.domain || ''}
      brandContext={
        brand
          ? {
              name: (brand as any)?.name,
              domain: (brand as any)?.domain,
              websiteUrl:
                (brand as any)?.websiteUrl ??
                (brand as any)?.website_url ??
                (brand as any)?.domain,
              colors: {
                primary: (brand as any)?.primaryColor ?? (brand as any)?.primary_color,
                secondary: (brand as any)?.secondaryColor ?? (brand as any)?.secondary_color,
                accent: (brand as any)?.accentColor ?? (brand as any)?.accent_color,
                background: (brand as any)?.backgroundColor ?? (brand as any)?.background_color,
                textPrimary:
                  (brand as any)?.textPrimaryColor ?? (brand as any)?.text_primary_color,
                link: (brand as any)?.linkColor ?? (brand as any)?.link_color,
              },
              typography: (brand as any)?.typography,
            }
          : undefined
      }
      brandLinks={brandLinks}
      figmaDesignData={figmaDesignData}
      initialFooterHtml={initialFooterHtml}
      initialFooterId={initialFooterId}
      savedFooters={savedFooters}
      onSaveFooter={handleSaveFooter}
      onBack={handleBack}
      onCreateTemplate={handleCreateTemplate}
      onCreateCampaign={handleCreateCampaign}
      onConvertToHtml={handleConvertToHtml}
      isCreating={isCreating}
      templateId={templateId}
      campaignId={campaignId}
      onReset={handleReset}
      klaviyoLists={klaviyoLists}
      selectedListId={selectedListId}
      onSelectList={setSelectedListId}
      isLoadingLists={isLoadingLists}
    />
  );
}
