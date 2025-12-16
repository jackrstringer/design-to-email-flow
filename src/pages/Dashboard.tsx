import { useState, useEffect, useCallback, useRef } from 'react';
import { CampaignCreator } from '@/components/dashboard/CampaignCreator';
import { BrandsView } from '@/components/dashboard/BrandsView';
import { BrandSettings } from '@/components/dashboard/BrandSettings';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { NewBrandModal } from '@/components/dashboard/NewBrandModal';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, BrandTypography, HtmlFormattingRule } from '@/types/brand-assets';
import type { Json } from '@/integrations/supabase/types';

type ViewMode = 'campaign' | 'brands' | 'brand-settings';

// Helper functions for JSON parsing
function parseSocialLinks(json: Json | null): Brand['socialLinks'] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as Brand['socialLinks'];
}

function parseAllLinks(json: Json | null): string[] {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as string[];
}

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

function mapRowToBrand(row: any): Brand {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    websiteUrl: row.website_url || undefined,
    darkLogoUrl: row.dark_logo_url || undefined,
    darkLogoPublicId: row.dark_logo_public_id || undefined,
    lightLogoUrl: row.light_logo_url || undefined,
    lightLogoPublicId: row.light_logo_public_id || undefined,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color || undefined,
    backgroundColor: row.background_color || undefined,
    textPrimaryColor: row.text_primary_color || undefined,
    linkColor: row.link_color || undefined,
    socialLinks: parseSocialLinks(row.social_links),
    allLinks: parseAllLinks(row.all_links),
    footerHtml: row.footer_html || undefined,
    footerLogoUrl: row.footer_logo_url || undefined,
    footerLogoPublicId: row.footer_logo_public_id || undefined,
    socialIcons: parseSocialIcons(row.social_icons),
    footerConfigured: row.footer_configured || false,
    klaviyoApiKey: row.klaviyo_api_key || undefined,
    typography: parseTypography(row.typography),
    htmlFormattingRules: parseFormattingRules(row.html_formatting_rules),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Store pending image data while waiting for brand selection/creation
interface PendingCampaign {
  file: File;
  dataUrl: string;
  matchedBrandId: string | null;
  detectedBrand: { url: string; name: string } | null;
  analysisData: any;
}

export default function Dashboard() {
  const [view, setView] = useState<ViewMode>('campaign');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewBrandModal, setShowNewBrandModal] = useState(false);
  const [pendingBrandDomain, setPendingBrandDomain] = useState<string | null>(null);
  const [settingsBrandId, setSettingsBrandId] = useState<string | null>(null);
  const [pendingCampaign, setPendingCampaign] = useState<PendingCampaign | null>(null);
  
  // Track if we're auto-analyzing a new brand in background
  const backgroundAnalysisRef = useRef<Promise<any> | null>(null);

  const fetchBrands = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name');

      if (error) throw error;
      const mappedBrands = (data || []).map(mapRowToBrand);
      setBrands(mappedBrands);
      
      // Don't auto-select any brand - let user drop campaign first
    } catch (error) {
      console.error('Error fetching brands:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const selectedBrand = brands.find(b => b.id === selectedBrandId) || null;
  const settingsBrand = brands.find(b => b.id === settingsBrandId) || null;

  // Called when a campaign image is dropped and brand is detected/matched
  const handleBrandDetected = useCallback((campaignData: PendingCampaign) => {
    // If AI matched an existing brand by ID
    if (campaignData.matchedBrandId) {
      const existingBrand = brands.find(b => b.id === campaignData.matchedBrandId);
      if (existingBrand) {
        setSelectedBrandId(existingBrand.id);
        setPendingCampaign(campaignData);
        return;
      }
    }
    
    // New brand detected - extract domain and show modal
    if (campaignData.detectedBrand?.url) {
      let domain: string;
      try {
        domain = new URL(campaignData.detectedBrand.url).hostname.replace('www.', '');
      } catch {
        domain = campaignData.detectedBrand.url.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
      }
      
      setPendingCampaign(campaignData);
      setPendingBrandDomain(domain);
      
      // Start brand analysis in background
      backgroundAnalysisRef.current = supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl: `https://${domain}` }
      });
      
      setShowNewBrandModal(true);
    }
  }, [brands]);

  // Called when user manually wants to add a brand (without pending campaign)
  const handleAddBrandClick = useCallback(() => {
    setPendingBrandDomain(null);
    setPendingCampaign(null);
    backgroundAnalysisRef.current = null;
    setShowNewBrandModal(true);
  }, []);

  const handleNewBrandCreated = useCallback((brand: Brand) => {
    setBrands(prev => [...prev, brand]);
    setSelectedBrandId(brand.id);
    setShowNewBrandModal(false);
    setPendingBrandDomain(null);
    backgroundAnalysisRef.current = null;
    // Keep pendingCampaign - CampaignCreator will continue processing
  }, []);

  const handleBrandSettingsClick = useCallback((brand: Brand) => {
    setSettingsBrandId(brand.id);
    setView('brand-settings');
  }, []);

  const handleBackFromSettings = useCallback(() => {
    setSettingsBrandId(null);
    setView('brands');
  }, []);

  const handleCampaignProcessed = useCallback(() => {
    // Clear pending campaign after it's been processed
    setPendingCampaign(null);
  }, []);

  // Compute header view (maps 'brand-settings' to 'brands' for nav highlighting)
  const headerView: 'campaign' | 'brands' = view === 'campaign' ? 'campaign' : 'brands';

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader 
        view={headerView} 
        onViewChange={(v) => {
          setView(v);
          if (v === 'brands') {
            setSettingsBrandId(null);
          }
        }}
      />
      
      <main className="container mx-auto px-4 py-8">
        {view === 'campaign' && (
          <CampaignCreator
            brands={brands}
            selectedBrandId={selectedBrandId}
            onBrandSelect={setSelectedBrandId}
            selectedBrand={selectedBrand}
            includeFooter={includeFooter}
            onIncludeFooterChange={setIncludeFooter}
            onBrandDetected={handleBrandDetected}
            onAddBrandClick={handleAddBrandClick}
            isLoading={isLoading}
            pendingCampaign={pendingCampaign}
            onCampaignProcessed={handleCampaignProcessed}
          />
        )}
        
        {view === 'brands' && (
          <BrandsView
            brands={brands}
            onBrandSelect={handleBrandSettingsClick}
            onAddBrand={handleAddBrandClick}
            onBrandsChange={fetchBrands}
          />
        )}
        
        {view === 'brand-settings' && settingsBrand && (
          <BrandSettings
            brand={settingsBrand}
            onBack={handleBackFromSettings}
            onBrandChange={fetchBrands}
          />
        )}
      </main>

      <NewBrandModal
        open={showNewBrandModal}
        onOpenChange={setShowNewBrandModal}
        initialDomain={pendingBrandDomain}
        onBrandCreated={handleNewBrandCreated}
        backgroundAnalysis={backgroundAnalysisRef.current}
      />
    </div>
  );
}
