import { useState } from 'react';
import { Header } from '@/components/Header';
import { UploadZone } from '@/components/UploadZone';
import { DesignPreview } from '@/components/DesignPreview';
import { BlockEditor } from '@/components/BlockEditor';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  
  const { isAnalyzing, blocks, originalDimensions, analyzeDesign, updateBlock } = useEmailAnalysis();

  const handleFileUpload = async (file: File, dataUrl: string) => {
    setUploadedImage(dataUrl);
    setSelectedBlockId(null);
    await analyzeDesign(dataUrl);
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 flex flex-col p-6">
        {!uploadedImage ? (
          <div className="flex-1 flex items-center justify-center">
            <UploadZone onFileUpload={handleFileUpload} isLoading={isAnalyzing} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4">
            {isAnalyzing ? (
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
