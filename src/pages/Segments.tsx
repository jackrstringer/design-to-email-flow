import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, KeyRound } from 'lucide-react';
import { useSegmentPresets } from '@/hooks/useSegmentPresets';
import { SegmentsTable } from '@/components/segments/SegmentsTable';
import { useBrandsQuery } from '@/hooks/useBrandsQuery';
import { Button } from '@/components/ui/button';
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

  // Pass klaviyoKeySet flag - hook resolves the key server-side and handles caching internally
  const {
    presets,
    loading: loadingPresets,
    klaviyoSegments,
    loadingSegments,
    createPreset,
    updatePreset,
    deletePreset,
  } = useSegmentPresets(selectedBrandId, selectedBrand?.klaviyoKeySet);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <h1 className="text-xl font-semibold tracking-tight">Segment sets</h1>
        
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
        {loadingBrands ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-md" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : brands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/50 mb-4" />
            <p className="text-sm font-medium">No brands yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a brand to start building segment sets.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/brands">Go to brands</Link>
            </Button>
          </div>
        ) : !selectedBrandId ? (
          <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
            Select a brand to manage segment sets
          </div>
        ) : !selectedBrand?.klaviyoKeySet ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <KeyRound className="w-10 h-10 text-muted-foreground/50 mb-4" />
            <p className="text-sm font-medium">No Klaviyo key for this brand</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add a Klaviyo key so Sendr can read this brand's segments.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to={`/brands/${selectedBrandId}/integrations`}>Add Klaviyo key</Link>
            </Button>
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
