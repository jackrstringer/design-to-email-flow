import { useState } from 'react';
import { BrandCard } from '@/components/BrandCard';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { Brand } from '@/types/brand-assets';
import { BrandOnboardingModal } from '@/components/dashboard/BrandOnboardingModal';
import { useBrandsQuery, useCampaignCountsQuery, useAddBrandToCache } from '@/hooks/useBrandsQuery';

export default function Brands() {
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  
  const { data: brands = [], isLoading } = useBrandsQuery();
  const { data: campaignCounts = {} } = useCampaignCountsQuery(brands.map(b => b.id));
  const addBrandToCache = useAddBrandToCache();

  const handleBrandCreated = (brand: Brand) => {
    addBrandToCache(brand);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background shrink-0">
        <div className="px-6">
          <div className="flex h-12 items-center justify-between">
            <span className="text-sm font-medium">Brands</span>
            <Button size="sm" onClick={() => setShowOnboardingModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Brand
            </Button>
          </div>
        </div>
      </header>
      
      <div className="flex-1 overflow-auto p-6">

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No brands yet</p>
            <Button onClick={() => setShowOnboardingModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first brand
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <BrandCard 
                key={brand.id} 
                brand={brand} 
                campaignCount={campaignCounts[brand.id] || 0}
              />
            ))}
          </div>
        )}
      </div>

      <BrandOnboardingModal
        open={showOnboardingModal}
        onOpenChange={setShowOnboardingModal}
        onBrandCreated={handleBrandCreated}
      />
    </div>
  );
}
