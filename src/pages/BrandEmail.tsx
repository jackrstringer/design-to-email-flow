import { useOutletContext } from 'react-router-dom';
import { BrandEmailSection } from '@/components/brand/BrandEmailSection';
import { Skeleton } from '@/components/ui/skeleton';
import type { BrandContextData } from '@/layouts/BrandLayout';

function EmailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function BrandEmail() {
  const { brand, refetchBrand, isLoading } = useOutletContext<BrandContextData>();

  if (isLoading) {
    return <EmailSkeleton />;
  }

  return (
    <BrandEmailSection brand={brand} onBrandChange={refetchBrand} />
  );
}
