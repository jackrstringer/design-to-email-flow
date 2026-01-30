import { Package, Layers, CheckCircle, AlertTriangle } from 'lucide-react';
import { useBrandLinkIndex } from '@/hooks/useBrandLinkIndex';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import { SitemapImportCard } from './SitemapImportCard';
import { BrandLinkTable } from './BrandLinkTable';
import { AddLinkModal } from './AddLinkModal';
import { LinkPreferencesCard } from './LinkPreferencesCard';

interface LinkIntelligenceSectionProps {
  brandId: string;
  domain: string;
}

export function LinkIntelligenceSection({ brandId, domain }: LinkIntelligenceSectionProps) {
  const { stats, statsLoading, refetch } = useBrandLinkIndex({ brandId });
  const { preferences } = useLinkPreferences(brandId);

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-medium">{statsLoading ? '...' : stats.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Products:</span>
          <span className="font-medium">{statsLoading ? '...' : stats.products}</span>
        </div>
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Collections:</span>
          <span className="font-medium">{statsLoading ? '...' : stats.collections}</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.unhealthy > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          <span className="text-muted-foreground">Healthy:</span>
          <span className="font-medium">
            {statsLoading ? '...' : `${stats.healthy}/${stats.total}`}
          </span>
        </div>
        <div className="ml-auto">
          <AddLinkModal brandId={brandId} onLinkAdded={refetch} />
        </div>
      </div>

      {/* Link Preferences */}
      <LinkPreferencesCard brandId={brandId} />

      {/* Sitemap Import */}
      <SitemapImportCard 
        brandId={brandId} 
        domain={domain} 
        savedSitemapUrl={preferences?.sitemap_url}
        onImportComplete={refetch}
      />

      {/* Link Table */}
      <BrandLinkTable brandId={brandId} />
    </div>
  );
}
