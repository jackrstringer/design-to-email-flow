import { useOutletContext } from 'react-router-dom';
import { BrandIdentityCompact } from '@/components/brand/BrandIdentityCompact';
import { Skeleton } from '@/components/ui/skeleton';
import type { BrandContextData } from '@/layouts/BrandLayout';

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex gap-6">
          <Skeleton className="h-24 w-40 rounded-lg" />
          <Skeleton className="h-24 w-40 rounded-lg" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export default function BrandOverview() {
  const { brand, refetchBrand, isLoading } = useOutletContext<BrandContextData>();

  if (isLoading) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Compact Brand Identity with logo upload */}
      <BrandIdentityCompact brand={brand} onBrandChange={refetchBrand} />
    </div>
  );
}
