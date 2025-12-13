import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { UploadZone } from '@/components/UploadZone';
import { DesignPreview } from '@/components/DesignPreview';
import { BlockEditor } from '@/components/BlockEditor';
import { BrandAssetsSetup } from '@/components/BrandAssetsSetup';
import { BrandSelectionModal } from '@/components/BrandSelectionModal';
import { NewBrandSetupModal } from '@/components/NewBrandSetupModal';
import { FooterSetupModal } from '@/components/FooterSetupModal';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { Loader2 } from 'lucide-react';
import type { Brand } from '@/types/brand-assets';

const Index = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  
  // Brand selection flow state
  const [pendingUpload, setPendingUpload] = useState<{ file: File; dataUrl: string } | null>(null);
  const [showBrandSelection, setShowBrandSelection] = useState(false);
  const [showNewBrandSetup, setShowNewBrandSetup] = useState(false);
  const [newBrandWebsiteUrl, setNewBrandWebsiteUrl] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  
  // Footer setup flow state
  const [showFooterSetup, setShowFooterSetup] = useState(false);
  
  const { isAnalyzing: isAnalyzingEmail, blocks, originalDimensions, analyzeDesign, updateBlock } = useEmailAnalysis();
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

  // When file is uploaded, show brand selection modal
  const handleFileUpload = (file: File, dataUrl: string) => {
    setPendingUpload({ file, dataUrl });
    setShowBrandSelection(true);
  };

  // Handle selecting an existing brand
  const handleSelectExistingBrand = async (brand: Brand) => {
    setSelectedBrand(brand);
    setShowBrandSelection(false);
    
    // Check if footer needs setup (first campaign for this brand)
    if (!brand.footerConfigured) {
      // We'll show footer setup after analysis if footer block is detected
    }
    
    // Proceed with analysis
    if (pendingUpload) {
      setUploadedImage(pendingUpload.dataUrl);
      await analyzeDesign(pendingUpload.dataUrl);
      setPendingUpload(null);
    }
  };

  // Handle creating a new brand
  const handleCreateNewBrand = (websiteUrl: string) => {
    setNewBrandWebsiteUrl(websiteUrl);
    setShowBrandSelection(false);
    setShowNewBrandSetup(true);
  };

  // Handle new brand setup complete
  const handleNewBrandComplete = async (brand: Brand) => {
    setSelectedBrand(brand);
    setShowNewBrandSetup(false);
    
    // Proceed with analysis
    if (pendingUpload) {
      setUploadedImage(pendingUpload.dataUrl);
      await analyzeDesign(pendingUpload.dataUrl);
      setPendingUpload(null);
    }
  };

  // Check for footer block after analysis completes
  useEffect(() => {
    if (blocks.length > 0 && selectedBrand && !selectedBrand.footerConfigured) {
      const hasFooterBlock = blocks.some((b) => (b as any).isFooter);
      if (hasFooterBlock) {
        setShowFooterSetup(true);
      }
    }
  }, [blocks, selectedBrand]);

  // Handle footer setup complete
  const handleFooterSetupComplete = async (footerAssets: {
    footerLogoUrl?: string;
    footerLogoPublicId?: string;
    socialIcons: any[];
  }) => {
    // In a real implementation, we'd save this to the brand
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

  const handleCancelBrandSelection = () => {
    setShowBrandSelection(false);
    setPendingUpload(null);
  };

  const handleCancelNewBrandSetup = () => {
    setShowNewBrandSetup(false);
    setNewBrandWebsiteUrl('');
    // Go back to brand selection
    setShowBrandSelection(true);
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

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
            <UploadZone onFileUpload={handleFileUpload} isLoading={isAnalyzingEmail} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4">
            {isAnalyzingEmail ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyzing your design with AI...</p>
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

      {/* Brand Selection Modal */}
      <BrandSelectionModal
        open={showBrandSelection}
        onSelectExistingBrand={handleSelectExistingBrand}
        onCreateNewBrand={handleCreateNewBrand}
        onClose={handleCancelBrandSelection}
      />

      {/* New Brand Setup Modal */}
      <NewBrandSetupModal
        open={showNewBrandSetup}
        websiteUrl={newBrandWebsiteUrl}
        onComplete={handleNewBrandComplete}
        onClose={handleCancelNewBrandSetup}
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
