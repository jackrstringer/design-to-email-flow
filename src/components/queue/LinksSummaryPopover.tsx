import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Copy, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRealLink } from '@/lib/links';
import { useBrandFavorites } from '@/hooks/useBrandFavorites';

interface Slice {
  link?: string;
}

interface LinksSummaryPopoverProps {
  slices: Slice[];
  brandDomain?: string;
  brandId?: string | null;
  /** compact = icon-sized trigger for the dense row mode */
  dense?: boolean;
}

interface DomainGroup {
  domain: string;
  external: boolean;
  urls: { url: string; count: number; path: string }[];
  total: number;
}

function parseUrl(raw: string): { domain: string; path: string } {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const path = `${u.pathname}${u.search}`.replace(/\/$/, '');
    return { domain: u.hostname.replace(/^www\./, ''), path: path || '/' };
  } catch {
    return { domain: raw, path: '' };
  }
}

/**
 * The trust surface: every destination this campaign links to, grouped by
 * domain, off-brand-domain destinations flagged. One glance answers
 * "where does this email send people?"
 */
export function LinksSummaryPopover({ slices, brandDomain, brandId, dense = false }: LinksSummaryPopoverProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const { isFavorite, toggle: toggleFavorite } = useBrandFavorites(brandId);

  const groups = useMemo<DomainGroup[]>(() => {
    const counts = new Map<string, number>();
    for (const s of slices) {
      if (!isRealLink(s.link)) continue;
      counts.set(s.link, (counts.get(s.link) || 0) + 1);
    }
    const byDomain = new Map<string, DomainGroup>();
    const brandHost = brandDomain?.replace(/^www\./, '').toLowerCase();
    for (const [url, count] of counts) {
      const { domain, path } = parseUrl(url);
      const external = brandHost
        ? !domain.toLowerCase().endsWith(brandHost)
        : false;
      let g = byDomain.get(domain);
      if (!g) {
        g = { domain, external, urls: [], total: 0 };
        byDomain.set(domain, g);
      }
      g.urls.push({ url, count, path });
      g.total += count;
    }
    // Within each group, sort favorited URLs to the top.
    for (const g of byDomain.values()) {
      g.urls.sort((a, b) => {
        const aFav = isFavorite(a.url) ? 0 : 1;
        const bFav = isFavorite(b.url) ? 0 : 1;
        return aFav - bFav;
      });
    }
    // brand domain first, then groups with any favorite, then by volume
    return Array.from(byDomain.values()).sort((a, b) => {
      if (a.external !== b.external) return a.external ? 1 : -1;
      const aHasFav = a.urls.some((u) => isFavorite(u.url)) ? 0 : 1;
      const bHasFav = b.urls.some((u) => isFavorite(u.url)) ? 0 : 1;
      if (aHasFav !== bHasFav) return aHasFav - bHasFav;
      return b.total - a.total;
    });
  }, [slices, brandDomain, isFavorite]);

  const uniqueCount = useMemo(
    () => new Set(slices.filter((s) => isRealLink(s.link)).map((s) => s.link)).size,
    [slices],
  );
  const externalCount = groups.filter((g) => g.external).length;

  if (uniqueCount === 0) {
    return <span className={cn('text-muted-foreground/60', dense ? 'text-[11px]' : 'text-[11px]')}>—</span>;
  }

  const handleCopy = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1 rounded-full font-medium tabular-nums transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            dense ? 'h-6 px-2 text-[11px]' : 'h-6 px-2 text-[11px]',
          )}
          title="All link destinations"
        >
          <span className="font-semibold text-foreground">{uniqueCount}</span>
          {!dense && <span>link{uniqueCount === 1 ? '' : 's'}</span>}
          <span
            className={cn(
              'ml-0.5 h-[5px] w-[5px] rounded-full',
              externalCount > 0 ? 'bg-warning' : 'bg-success',
            )}
            aria-label={externalCount > 0 ? 'external destinations present' : 'all destinations on brand domain'}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-50 w-[340px] rounded-2xl border-0 p-0 shadow-floating"
        align="end"
        sideOffset={6}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-1.5 px-4 pb-2 pt-3.5">
          <span className="text-[12.5px] font-semibold text-foreground">Where this email links</span>
          <span className="ml-auto text-[11px] font-medium text-muted-foreground">
            {uniqueCount} destination{uniqueCount === 1 ? '' : 's'} · {groups.length} domain{groups.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="max-h-[320px] overflow-y-auto px-1.5 pb-1.5">
          {groups.map((g) => (
            <div key={g.domain} className="mb-1 rounded-xl bg-muted/60 px-2.5 py-2 last:mb-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-[5px] w-[5px] shrink-0 rounded-full',
                    g.external ? 'bg-warning' : 'bg-success',
                  )}
                />
                <span className="truncate text-[12px] font-semibold text-foreground">{g.domain}</span>
                {g.external && (
                  <span className="rounded-full bg-warning/15 px-1.5 py-px text-[9.5px] font-semibold text-warning">
                    external
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[10.5px] font-medium tabular-nums text-muted-foreground">
                  ×{g.total}
                </span>
              </div>
              <div className="mt-1 flex flex-col">
                {g.urls.map(({ url, count, path }) => {
                  const fav = isFavorite(url);
                  return (
                    <div key={url} className="group/url flex min-w-0 items-center gap-1.5 rounded-md py-[3px] pl-[11px] pr-1">
                      <button
                        type="button"
                        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(url);
                        }}
                        className={cn(
                          'shrink-0 rounded p-0.5 transition-[color,opacity] duration-150',
                          fav
                            ? 'text-amber-400 opacity-100'
                            : 'text-muted-foreground/50 opacity-0 group-hover/url:opacity-100 hover:text-amber-400',
                        )}
                      >
                        <Star className={cn('h-3 w-3', fav && 'fill-amber-400')} />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                        title={url}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {path}
                      </a>
                      {count > 1 && (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">×{count}</span>
                      )}
                      <button
                        onClick={(e) => handleCopy(url, e)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors hover:bg-secondary group-hover/url:text-muted-foreground"
                        title="Copy URL"
                      >
                        {copied === url ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {brandDomain && (
          <div className="border-t border-border/60 px-4 py-2 text-[10.5px] text-muted-foreground">
            {externalCount === 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-success" />
                Every destination is on {brandDomain.replace(/^www\./, '')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-warning" />
                {externalCount} domain{externalCount === 1 ? '' : 's'} outside {brandDomain.replace(/^www\./, '')} — check before approving
              </span>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
