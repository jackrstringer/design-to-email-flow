import { useOutletContext } from 'react-router-dom';
import { BrandIntegrationsSection } from '@/components/brand/BrandIntegrationsSection';
import type { BrandContextData } from '@/layouts/BrandLayout';

export default function BrandIntegrations() {
  const { brand, refetchBrand } = useOutletContext<BrandContextData>();

  return (
    <BrandIntegrationsSection brand={brand} onBrandChange={refetchBrand} />
  );
}
