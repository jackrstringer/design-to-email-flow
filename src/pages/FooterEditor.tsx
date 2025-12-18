import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CampaignStudio } from '@/components/CampaignStudio';
import type { Brand } from '@/types/brand-assets';
import type { ProcessedSlice } from '@/types/slice';

interface LocationState {
  referenceImageUrl: string;
  footerHtml: string;
  footerName?: string;
}

export default function FooterEditor() {
  const { brandId } = useParams<{ brandId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [brand, setBrand] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [footerHtml, setFooterHtml] = useState(state?.footerHtml || '');
  const [footerName, setFooterName] = useState(state?.footerName || 'New Footer');
  const [referenceImageUrl, setReferenceImageUrl] = useState(state?.referenceImageUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!brandId) {
      navigate('/');
      return;
    }

    if (!state?.referenceImageUrl || !state?.footerHtml) {
      toast.error('Missing footer data');
      navigate(`/brands/${brandId}`);
      return;
    }

    fetchBrand();
  }, [brandId, state]);

  const fetchBrand = async () => {
    if (!brandId) return;

    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('id', brandId)
      .single();

    if (error || !data) {
      toast.error('Brand not found');
      navigate('/');
      return;
    }

    setBrand({
      id: data.id,
      name: data.name,
      domain: data.domain,
      websiteUrl: data.website_url || undefined,
      primaryColor: data.primary_color,
      secondaryColor: data.secondary_color,
      accentColor: data.accent_color || undefined,
      backgroundColor: data.background_color || undefined,
      textPrimaryColor: data.text_primary_color || undefined,
      linkColor: data.link_color || undefined,
      darkLogoUrl: data.dark_logo_url || undefined,
      lightLogoUrl: data.light_logo_url || undefined,
      socialLinks: Array.isArray(data.social_links) ? data.social_links as any : [],
      allLinks: Array.isArray(data.all_links) ? data.all_links as string[] : [],
      klaviyoApiKey: data.klaviyo_api_key || undefined,
      footerConfigured: data.footer_configured || false,
      footerHtml: data.footer_html || undefined,
      typography: data.typography as any,
      htmlFormattingRules: data.html_formatting_rules as any,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
    setIsLoading(false);
  };

  const handleSaveFooter = async (name: string, html: string) => {
    if (!brandId) return;

    setIsSaving(true);
    try {
      // Check if there are any existing footers
      const { data: existingFooters } = await supabase
        .from('brand_footers')
        .select('id')
        .eq('brand_id', brandId);

      const isFirstFooter = !existingFooters || existingFooters.length === 0;

      // Save to brand_footers table
      const { error } = await supabase
        .from('brand_footers')
        .insert({
          brand_id: brandId,
          name: name,
          html: html,
          logo_url: brand?.lightLogoUrl || null,
          is_primary: isFirstFooter, // First footer is primary
        });

      if (error) throw error;

      // Update brand.footer_configured
      await supabase
        .from('brands')
        .update({ footer_configured: true })
        .eq('id', brandId);

      toast.success('Footer saved successfully!');
      navigate(`/brands/${brandId}`);
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save footer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate(`/brands/${brandId}`);
  };

  if (isLoading || !brand) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use empty slices array for footer mode
  const emptySlices: ProcessedSlice[] = [];

  return (
    <CampaignStudio
      mode="footer"
      slices={emptySlices}
      onSlicesChange={() => {}}
      originalImageUrl={referenceImageUrl}
      brandUrl={brand.websiteUrl || `https://${brand.domain}`}
      brandContext={{
        name: brand.name,
        domain: brand.domain,
        websiteUrl: brand.websiteUrl,
        colors: {
          primary: brand.primaryColor,
          secondary: brand.secondaryColor,
          accent: brand.accentColor,
          background: brand.backgroundColor,
          textPrimary: brand.textPrimaryColor,
          link: brand.linkColor,
        },
        lightLogoUrl: brand.lightLogoUrl,
        darkLogoUrl: brand.darkLogoUrl,
        socialLinks: brand.socialLinks,
      }}
      initialFooterHtml={footerHtml}
      onSaveFooter={handleSaveFooter}
      onBack={handleBack}
      onCreateTemplate={() => {}}
      onCreateCampaign={() => {}}
      onConvertToHtml={async () => {}}
      isCreating={isSaving}
      footerName={footerName}
      onFooterNameChange={setFooterName}
    />
  );
}
