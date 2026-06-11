import { useOutletContext } from 'react-router-dom';
import { BrandIntegrationsSection } from '@/components/brand/BrandIntegrationsSection';
import { Skeleton } from '@/components/ui/skeleton';
import type { BrandContextData } from '@/layouts/BrandLayout';

function IntegrationsSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function BrandIntegrations() {
  const { brand, refetchBrand, isLoading } = useOutletContext<BrandContextData>();

  if (isLoading) {
    return <IntegrationsSkeleton />;
  }

  return (
    <BrandIntegrationsSection brand={brand} onBrandChange={refetchBrand} />
  );
}
