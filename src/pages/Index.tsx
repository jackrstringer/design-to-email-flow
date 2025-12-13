import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { UploadZone } from '@/components/UploadZone';
import { DesignPreview } from '@/components/DesignPreview';
import { BlockEditor } from '@/components/BlockEditor';
import { BrandAssetsSetup } from '@/components/BrandAssetsSetup';
import { BrandSetupModal } from '@/components/BrandSetupModal';
import { FooterSetupModal } from '@/components/FooterSetupModal';
import { useEmailAnalysis, DetectedBrand } from '@/hooks/useEmailAnalysis';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { useBrands } from '@/hooks/useBrands';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Brand, SocialLink } from '@/types/brand-assets';

interface ScrapedBrandData {
  url: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  socialLinks?: SocialLink[];
  allLinks?: string[];
}

const Index = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  
  // Brand flow state
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [showBrandSetup, setShowBrandSetup] = useState(false);
  const [scrapedBrandData, setScrapedBrandData] = useState<ScrapedBrandData | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  
  // Footer setup flow state
  const [showFooterSetup, setShowFooterSetup] = useState(false);
  
  const { isAnalyzing: isAnalyzingEmail, blocks, originalDimensions, detectedBrand, analyzeDesign, updateBlock } = useEmailAnalysis();
  const { findBrandByDomain } = useBrands();
  const {
    assets,
    isUploading,
    isAnalyzing: isAnalyzingBrand,
    analyzeBrand,
    uploadLogo,
    removeLogo,
    updateSocialLinks,
    updateColors,
    saveBrand,
    hasCompletedSetup,
  } = useBrandAssets();

  // Smart upload handler - analyzes design, detects brand, scrapes if needed
  const handleFileUpload = async (file: File, dataUrl: string) => {
    setUploadedImage(dataUrl);
    
    try {
      // Step 1: Analyze the design (includes brand detection)
      const result = await analyzeDesign(dataUrl);
      
      if (!result.detectedBrand?.url) {
        toast.error('Could not detect brand from email. Please try again.');
        return;
      }

      // Step 2: Check if brand exists in database
      const existingBrand = await findBrandByDomain(result.detectedBrand.url);
      
      if (existingBrand) {
        // Use existing brand
        setSelectedBrand(existingBrand);
        toast.success(`Using existing brand: ${existingBrand.name}`);
        
        // Check if footer setup needed
        if (!existingBrand.footerConfigured) {
          const hasFooterBlock = result.blocks.some((b: any) => b.isFooter);
          if (hasFooterBlock) {
            setShowFooterSetup(true);
          }
        }
      } else {
        // New brand - scrape website for details
        await scrapeBrandWebsite(result.detectedBrand);
      }
    } catch (error) {
      console.error('Upload flow error:', error);
      toast.error('Failed to process design');
    }
  };

  // Scrape brand website using Firecrawl
  const scrapeBrandWebsite = async (detected: DetectedBrand) => {
    setIsScraping(true);
    
    try {
      const websiteUrl = detected.url.startsWith('http') ? detected.url : `https://${detected.url}`;
      
      // Call the analyze-brand edge function
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl }
      });

      const scraped: ScrapedBrandData = {
        url: detected.url,
        name: detected.name || detected.url.split('.')[0].charAt(0).toUpperCase() + detected.url.split('.')[0].slice(1),
        primaryColor: data?.colors?.primary || '#3b82f6',
        secondaryColor: data?.colors?.secondary || '#64748b',
        socialLinks: data?.socialLinks || [],
        allLinks: data?.allLinks || [],
      };

      setScrapedBrandData(scraped);
      setShowBrandSetup(true);
      
      if (error) {
        console.warn('Brand scrape partial failure:', error);
        toast.info('Detected brand, please complete setup');
      } else {
        toast.success('Brand info scraped! Please upload logos.');
      }
    } catch (error) {
      console.error('Brand scrape error:', error);
      
      // Still show modal with basic info
      setScrapedBrandData({
        url: detected.url,
        name: detected.name || detected.url.split('.')[0],
      });
      setShowBrandSetup(true);
      toast.info('Please complete brand setup');
    } finally {
      setIsScraping(false);
    }
  };

  // Handle brand setup complete
  const handleBrandSetupComplete = (brand: Brand) => {
    setSelectedBrand(brand);
    setShowBrandSetup(false);
    setScrapedBrandData(null);
    
    // Check for footer setup
    const hasFooterBlock = blocks.some((b: any) => b.isFooter);
    if (hasFooterBlock && !brand.footerConfigured) {
      setShowFooterSetup(true);
    }
  };

  // Handle footer setup complete
  const handleFooterSetupComplete = async (footerAssets: {
    footerLogoUrl?: string;
    footerLogoPublicId?: string;
    socialIcons: any[];
  }) => {
    console.log('Footer assets saved:', footerAssets);
    setShowFooterSetup(false);
  };

  const handleSetupComplete = async () => {
    if (assets.websiteUrl) {
      try {
        const url = new URL(assets.websiteUrl.startsWith('http') ? assets.websiteUrl : `https://${assets.websiteUrl}`);
        const domain = url.hostname.replace('www.', '');
        const brandName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
        await saveBrand(brandName);
      } catch {
        // Fallback: just close setup without saving
      }
    }
    setShowSetup(false);
  };

  const handleCancelBrandSetup = () => {
    setShowBrandSetup(false);
    setScrapedBrandData(null);
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);
  const isProcessing = isAnalyzingEmail || isScraping;

  // Show setup screen if not completed or manually triggered
  if (!hasCompletedSetup || showSetup) {
    return (
      <BrandAssetsSetup
        assets={assets}
        isUploading={isUploading}
        isAnalyzing={isAnalyzingBrand}
        onAnalyzeBrand={analyzeBrand}
        onUploadLogo={uploadLogo}
        onRemoveLogo={removeLogo}
        onUpdateSocialLinks={updateSocialLinks}
        onUpdateColors={updateColors}
        onComplete={handleSetupComplete}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header onOpenSettings={() => setShowSetup(true)} />
      
      {!uploadedImage && (
        <HeroSection 
          title="New Campaign" 
          subtitle="Upload your email design and convert it to production-ready HTML"
        />
      )}
      
      <main className="flex-1 flex flex-col p-6">
        {!uploadedImage ? (
          <div className="flex-1 flex items-center justify-center -mt-8">
            <UploadZone onFileUpload={handleFileUpload} isLoading={isProcessing} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4">
            {isProcessing ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {isScraping ? 'Scraping brand website...' : 'Analyzing your design with AI...'}
                </p>
              </div>
            ) : (
              <DesignPreview
                imageUrl={uploadedImage}
                blocks={blocks}
                selectedBlockId={selectedBlockId}
                onBlockSelect={setSelectedBlockId}
                originalWidth={originalDimensions.width}
                originalHeight={originalDimensions.height}
              />
            )}
          </div>
        )}
      </main>

      {selectedBlock && (
        <BlockEditor block={selectedBlock} onUpdate={updateBlock} />
      )}

      {/* Brand Setup Modal - shown for new brands after AI detection + scraping */}
      <BrandSetupModal
        open={showBrandSetup}
        scrapedData={scrapedBrandData}
        onComplete={handleBrandSetupComplete}
        onClose={handleCancelBrandSetup}
      />

      {/* Footer Setup Modal */}
      <FooterSetupModal
        open={showFooterSetup}
        onClose={() => setShowFooterSetup(false)}
        onSave={handleFooterSetupComplete}
        brandSocialLinks={selectedBrand?.socialLinks || []}
      />
    </div>
  );
};

export default Index;
