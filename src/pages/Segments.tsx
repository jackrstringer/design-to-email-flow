import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSegmentPresets } from '@/hooks/useSegmentPresets';
import { SegmentsTable } from '@/components/segments/SegmentsTable';
import { useBrandsQuery } from '@/hooks/useBrandsQuery';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const SEGMENTS_LAST_BRAND_KEY = 'segments-last-brand-id';

export default function Segments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBrandId = searchParams.get('brand');

  const { data: brands = [], isLoading: loadingBrands } = useBrandsQuery();

  // Restore from localStorage on mount if no brand param in URL
  useEffect(() => {
    if (searchParams.get('brand')) return; // Already have a brand param
    
    const storedBrandId = localStorage.getItem(SEGMENTS_LAST_BRAND_KEY);
    if (storedBrandId) {
      setSearchParams({ brand: storedBrandId }, { replace: true });
    }
  }, []); // Only run on mount

  // Auto-select first brand when brands load, or reset if selected brand doesn't exist
  useEffect(() => {
    if (brands.length === 0) return;
    
    const currentBrand = searchParams.get('brand');
    const brandExists = currentBrand && brands.some(b => b.id === currentBrand);
    
    if (!brandExists) {
      const fallbackBrand = brands[0].id;
      setSearchParams({ brand: fallbackBrand }, { replace: true });
      localStorage.setItem(SEGMENTS_LAST_BRAND_KEY, fallbackBrand);
    }
  }, [brands, searchParams, setSearchParams]);

  const setSelectedBrandId = (brandId: string) => {
    setSearchParams({ brand: brandId });
    localStorage.setItem(SEGMENTS_LAST_BRAND_KEY, brandId);
  };

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) || null;

  // Pass klaviyoApiKey directly - hook handles caching internally
  const {
    presets,
    loading: loadingPresets,
    klaviyoSegments,
    loadingSegments,
    createPreset,
    updatePreset,
    deletePreset,
  } = useSegmentPresets(selectedBrandId, selectedBrand?.klaviyoApiKey);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <h1 className="text-xl font-semibold">Segment Sets</h1>
        
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Brand:</span>
          {loadingBrands ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <Select
              value={selectedBrandId || ''}
              onValueChange={setSelectedBrandId}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a brand">
                  {selectedBrand && (
                    <span 
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        background: `linear-gradient(135deg, ${selectedBrand.primaryColor}18 0%, ${selectedBrand.primaryColor}08 100%)`,
                        color: selectedBrand.primaryColor,
                      }}
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ backgroundColor: selectedBrand.primaryColor }} 
                      />
                      {selectedBrand.name}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    <span 
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        background: `linear-gradient(135deg, ${brand.primaryColor}18 0%, ${brand.primaryColor}08 100%)`,
                        color: brand.primaryColor,
                      }}
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ backgroundColor: brand.primaryColor }} 
                      />
                      {brand.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {!selectedBrandId ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Select a brand to manage segment sets
          </div>
        ) : !selectedBrand?.klaviyoApiKey ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            This brand doesn't have a Klaviyo API key configured.
            <br />
            Go to Brand Settings to add one.
          </div>
        ) : (
          <SegmentsTable
            presets={presets}
            loading={loadingPresets}
            klaviyoSegments={klaviyoSegments}
            loadingSegments={loadingSegments}
            brandId={selectedBrandId}
            onCreatePreset={createPreset}
            onUpdatePreset={updatePreset}
            onDeletePreset={deletePreset}
          />
        )}
      </div>
    </div>
  );
}
