import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CampaignStudio } from '@/components/CampaignStudio';
import type { ProcessedSlice } from '@/types/slice';
import type { Brand } from '@/types/brand-assets';

interface LocationState {
  imageUrl: string;
  brand: Brand;
  includeFooter: boolean;
  blocks: Array<{
    imageUrl?: string;
    altText?: string;
    link?: string;
    isClickable?: boolean;
    type?: 'image' | 'html';
    htmlContent?: string;
  }>;
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [slices, setSlices] = useState<ProcessedSlice[]>([]);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (state) {
      // Initialize from navigation state
      setOriginalImageUrl(state.imageUrl);
      setBrand(state.brand);
      
      // Convert blocks to ProcessedSlice format
      if (state.blocks && state.blocks.length > 0) {
        const processedSlices: ProcessedSlice[] = state.blocks.map((block) => ({
          imageUrl: block.imageUrl || state.imageUrl,
          altText: block.altText || '',
          link: block.link || null,
          isClickable: block.isClickable || false,
          type: block.type || 'image',
          htmlContent: block.htmlContent,
        }));
        setSlices(processedSlices);
      } else {
        // Default single slice from the whole image
        setSlices([{
          imageUrl: state.imageUrl,
          altText: '',
          link: null,
          isClickable: false,
          type: 'image',
        }]);
      }
      setIsLoading(false);
    } else {
      // Load from database if no state
      loadCampaign();
    }
  }, [id, state]);

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
      
      // Parse brand data
      if (campaign.brands) {
        setBrand(campaign.brands as unknown as Brand);
      }

      // Parse blocks from campaign
      const blocks = campaign.blocks as Array<any> || [];
      if (blocks.length > 0) {
        setSlices(blocks.map((block: any) => ({
          imageUrl: block.imageUrl || campaign.original_image_url,
          altText: block.altText || '',
          link: block.link || null,
          isClickable: block.isClickable || false,
          type: block.type || 'image',
          htmlContent: block.htmlContent,
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
          imageUrl: slice.imageUrl,
          brandUrl: brand?.websiteUrl || brand?.domain,
        }
      });

      if (error) throw error;

      const updatedSlices = [...slices];
      updatedSlices[index] = {
        ...updatedSlices[index],
        type: 'html',
        htmlContent: data.html,
      };
      setSlices(updatedSlices);
    } catch (error) {
      console.error('Error converting to HTML:', error);
      toast.error('Failed to convert slice to HTML');
    }
  };

  const handleCreateTemplate = async () => {
    if (!brand?.klaviyoApiKey) {
      toast.error('No Klaviyo API key configured for this brand');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          slices,
          apiKey: brand.klaviyoApiKey,
          templateName: `Campaign ${new Date().toLocaleDateString()}`,
          footerHtml: brand.footerHtml,
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

  const handleCreateCampaign = async () => {
    if (!brand?.klaviyoApiKey) {
      toast.error('No Klaviyo API key configured for this brand');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          slices,
          apiKey: brand.klaviyoApiKey,
          templateName: `Campaign ${new Date().toLocaleDateString()}`,
          footerHtml: brand.footerHtml,
          createCampaign: true,
        }
      });

      if (error) throw error;

      setCampaignId(data.campaignId);
      setTemplateId(data.templateId);
      toast.success('Campaign created successfully!');
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error('Failed to create campaign');
    } finally {
      setIsCreating(false);
    }
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

  return (
    <CampaignStudio
      slices={slices}
      onSlicesChange={setSlices}
      originalImageUrl={originalImageUrl}
      brandUrl={brand?.websiteUrl || brand?.domain || ''}
      onBack={handleBack}
      onCreateTemplate={handleCreateTemplate}
      onCreateCampaign={handleCreateCampaign}
      onConvertToHtml={handleConvertToHtml}
      isCreating={isCreating}
      templateId={templateId}
      campaignId={campaignId}
      onReset={handleReset}
    />
  );
}
