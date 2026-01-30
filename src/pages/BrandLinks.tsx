import { useOutletContext } from 'react-router-dom';
import { LinkIntelligenceSection } from '@/components/brand/LinkIntelligenceSection';
import type { BrandContextData } from '@/layouts/BrandLayout';

export default function BrandLinks() {
  const { brand } = useOutletContext<BrandContextData>();

  return (
    <LinkIntelligenceSection brandId={brand.id} domain={brand.domain} />
  );
}
