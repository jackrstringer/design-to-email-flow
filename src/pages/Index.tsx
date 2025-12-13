import { useState } from 'react';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { UploadZone } from '@/components/UploadZone';
import { DesignPreview } from '@/components/DesignPreview';
import { BlockEditor } from '@/components/BlockEditor';
import { BrandAssetsSetup } from '@/components/BrandAssetsSetup';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  
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

  const handleFileUpload = async (file: File, dataUrl: string) => {
    setUploadedImage(dataUrl);
    setSelectedBlockId(null);
    await analyzeDesign(dataUrl);
  };

  const handleSetupComplete = async () => {
    // Extract brand name from website URL or use domain
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
    </div>
  );
};

export default Index;
