import { useOutletContext } from 'react-router-dom';
import { Link2, AlertCircle, RefreshCw } from 'lucide-react';
import { LinkIntelligenceSection } from '@/components/brand/LinkIntelligenceSection';
import { SitemapImportCard } from '@/components/brand/SitemapImportCard';
import { useBrandLinkIndex } from '@/hooks/useBrandLinkIndex';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BrandContextData } from '@/layouts/BrandLayout';

function LinksSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-5 w-2/3" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BrandLinks() {
  const { brand, isLoading: brandLoading } = useOutletContext<BrandContextData>();
  const { stats, statsLoading, error, refetch } = useBrandLinkIndex({ brandId: brand.id });

  const { preferences } = useLinkPreferences(brand.id);

  if (brandLoading || statsLoading) {
    return <LinksSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn't load links</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>Something went wrong while loading the link index. Try again.</span>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="rounded-lg border bg-card flex flex-col items-center justify-center text-center px-6 py-16">
        <Link2 className="w-10 h-10 text-muted-foreground/50 mb-4" />
        <p className="text-sm font-medium">No links indexed yet</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Import the sitemap so CTAs deep-link to product pages.
        </p>
        <div className="mt-4">
          <SitemapImportCard
            brandId={brand.id}
            domain={brand.domain}
            savedSitemapUrl={preferences?.sitemap_url}
            onImportComplete={refetch}
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <LinkIntelligenceSection brandId={brand.id} domain={brand.domain} />
  );
}
