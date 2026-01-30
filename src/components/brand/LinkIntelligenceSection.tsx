import { Package, Layers, CheckCircle, AlertTriangle } from 'lucide-react';
import { useBrandLinkIndex } from '@/hooks/useBrandLinkIndex';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import { SitemapImportCard } from './SitemapImportCard';
import { BrandLinkTable } from './BrandLinkTable';
import { AddLinkModal } from './AddLinkModal';
import { LinkPreferencesCard } from './LinkPreferencesCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface LinkIntelligenceSectionProps {
  brandId: string;
  domain: string;
}

export function LinkIntelligenceSection({ brandId, domain }: LinkIntelligenceSectionProps) {
  const { stats, statsLoading, refetch } = useBrandLinkIndex({ brandId });
  const { preferences } = useLinkPreferences(brandId);

  return (
    <div className="space-y-6">
      {/* Link Preferences Card - Prominent */}
      <LinkPreferencesCard brandId={brandId} />

      {/* Link Index Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Link Index</CardTitle>
              <CardDescription className="text-xs">Product and collection URLs for instant matching</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <SitemapImportCard 
                brandId={brandId} 
                domain={domain} 
                savedSitemapUrl={preferences?.sitemap_url}
                onImportComplete={refetch}
                compact
              />
              <AddLinkModal brandId={brandId} onLinkAdded={refetch} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats Row */}
          <div className="flex items-center gap-6 text-sm mb-6 pb-4 border-b">
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
              <span className="text-muted-foreground">Health:</span>
              <span className="font-medium">
                {statsLoading ? '...' : `${stats.healthy}/${stats.total}`}
              </span>
            </div>
          </div>

          {/* Link Table */}
          <BrandLinkTable brandId={brandId} />
        </CardContent>
      </Card>
    </div>
  );
}
