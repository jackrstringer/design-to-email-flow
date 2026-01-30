import { useOutletContext } from 'react-router-dom';
import { BrandEmailSection } from '@/components/brand/BrandEmailSection';
import type { BrandContextData } from '@/layouts/BrandLayout';

export default function BrandEmail() {
  const { brand, refetchBrand } = useOutletContext<BrandContextData>();

  return (
    <BrandEmailSection brand={brand} onBrandChange={refetchBrand} />
  );
}
