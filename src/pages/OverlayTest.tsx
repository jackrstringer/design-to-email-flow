import { useEffect, useState } from 'react';
import { DesignPreview } from '@/components/DesignPreview';
import { useEmailAnalysis } from '@/hooks/useEmailAnalysis';
import type { EmailBlock } from '@/types/email-blocks';

// Debug page that automatically analyzes a fixed test email image
// at /test-overlay using public/test-email.png
const OverlayTest = () => {
  const { isAnalyzing, blocks, originalDimensions, analyzeDesign } = useEmailAnalysis();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // Helper to load a public image and convert it to a data URL
  const loadPublicImageAsDataUrl = async (path: string): Promise<string> => {
    const response = await fetch(path);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to convert image to data URL'));
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  };

  // Auto-run analysis on mount exactly once
  useEffect(() => {
    if (hasRun) return;
    setHasRun(true);

    (async () => {
      try {
        setError(null);
        const dataUrl = await loadPublicImageAsDataUrl('/test-email.png');
        await analyzeDesign(dataUrl);
      } catch (e) {
        console.error('Overlay test error:', e);
        setError('Failed to analyze test image');
      }
    })();
  }, [analyzeDesign, hasRun]);

  const { width, height } = originalDimensions;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Overlay Alignment Test</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatically analyzes <code className="px-1 py-0.5 rounded bg-muted text-[10px]">public/test-email.png</code>{' '}
            and renders detected blocks over the original design.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Analyzing: {isAnalyzing ? 'Yes' : 'No'}</div>
          <div>
            Dimensions: {width} × {height}
          </div>
          <div>Blocks: {blocks.length}</div>
        </div>
      </header>

      <section className="p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)] gap-6">
        <div>
          {error && (
            <div className="mb-3 rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {width > 0 && height > 0 && blocks.length > 0 ? (
            <DesignPreview
              imageUrl="/test-email.png"
              blocks={blocks as EmailBlock[]}
              selectedBlockId={selectedBlockId}
              onBlockSelect={setSelectedBlockId}
              analyzedWidth={width}
              analyzedHeight={height}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
              {isAnalyzing ? 'Analyzing test image…' : 'Waiting for analysis result…'}
            </div>
          )}
        </div>

        {/* Debug sidebar */}
        <aside className="border border-border/60 rounded-lg bg-muted/20 p-4 text-xs space-y-3 max-h-[80vh] overflow-auto">
          <div>
            <h2 className="font-medium mb-1">Blocks</h2>
            <p className="text-[11px] text-muted-foreground mb-2">
              Click a row to highlight the corresponding overlay block.
            </p>
            <div className="space-y-1">
              {blocks.map((block) => {
                const isSelected = block.id === selectedBlockId;
                const bottom = block.bounds.y + block.bounds.height;
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => setSelectedBlockId(block.id)}
                    className={
                      'w-full text-left px-2 py-1.5 rounded border text-[11px] transition-colors ' +
                      (isSelected
                        ? 'border-primary bg-primary/10 text-primary-foreground'
                        : 'border-border/60 bg-background hover:bg-muted/80')
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{block.name}</span>
                      <span className="uppercase tracking-wide text-[10px] text-muted-foreground">
                        {block.type}
                      </span>
                    </div>
                    <div className="mt-0.5 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                      <span>
                        y: {block.bounds.y} → {Math.round(block.bounds.y)}
                      </span>
                      <span>
                        h: {block.bounds.height} → {Math.round(block.bounds.height)}
                      </span>
                      <span>bottom: {Math.round(bottom)}</span>
                      <span>
                        footer: {(block as any).isFooter ? 'yes' : 'no'}
                      </span>
                    </div>
                  </button>
                );
              })}

              {blocks.length === 0 && !isAnalyzing && (
                <p className="text-[11px] text-muted-foreground">No blocks yet.</p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
};

export default OverlayTest;
