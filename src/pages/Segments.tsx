import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSegmentPresets } from '@/hooks/useSegmentPresets';
import { SegmentsTable } from '@/components/segments/SegmentsTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface Brand {
  id: string;
  name: string;
  klaviyo_api_key: string | null;
  primary_color: string;
}

export default function Segments() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(true);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) || null;

  const {
    presets,
    loading: loadingPresets,
    klaviyoSegments,
    loadingSegments,
    fetchKlaviyoSegments,
    createPreset,
    updatePreset,
    deletePreset,
  } = useSegmentPresets(selectedBrandId);

  // Fetch brands on mount
  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('id, name, klaviyo_api_key, primary_color')
          .order('name');

        if (error) throw error;

        setBrands(data || []);
        if (data && data.length > 0 && !selectedBrandId) {
          setSelectedBrandId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching brands:', error);
      } finally {
        setLoadingBrands(false);
      }
    };

    fetchBrands();
  }, []);

  // Fetch Klaviyo segments when brand changes
  useEffect(() => {
    if (selectedBrand?.klaviyo_api_key) {
      fetchKlaviyoSegments(selectedBrand.klaviyo_api_key);
    }
  }, [selectedBrand?.klaviyo_api_key, fetchKlaviyoSegments]);

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
                        background: `linear-gradient(135deg, ${selectedBrand.primary_color}18 0%, ${selectedBrand.primary_color}08 100%)`,
                        color: selectedBrand.primary_color,
                      }}
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ backgroundColor: selectedBrand.primary_color }} 
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
                        background: `linear-gradient(135deg, ${brand.primary_color}18 0%, ${brand.primary_color}08 100%)`,
                        color: brand.primary_color,
                      }}
                    >
                      <span 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ backgroundColor: brand.primary_color }} 
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
        ) : !selectedBrand?.klaviyo_api_key ? (
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
