import { useOutletContext } from 'react-router-dom';
import { BrandIdentityCompact } from '@/components/brand/BrandIdentityCompact';
import type { BrandContextData } from '@/layouts/BrandLayout';

export default function BrandOverview() {
  const { brand, refetchBrand } = useOutletContext<BrandContextData>();

  return (
    <div className="space-y-8">
      {/* Compact Brand Identity with logo upload */}
      <BrandIdentityCompact brand={brand} onBrandChange={refetchBrand} />
    </div>
  );
}
