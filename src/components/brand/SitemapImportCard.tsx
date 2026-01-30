import { useState } from 'react';
import { Loader2, Globe, AlertCircle, CheckCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useSitemapImport } from '@/hooks/useSitemapImport';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SitemapImportCardProps {
  brandId: string;
  domain: string;
  savedSitemapUrl?: string;
  onImportComplete?: () => void;
  compact?: boolean;
}

export function SitemapImportCard({ 
  brandId, 
  domain, 
  savedSitemapUrl,
  onImportComplete,
  compact = false,
}: SitemapImportCardProps) {
  const { 
    job, 
    isRunning, 
    isComplete, 
    isFailed, 
    triggerCrawl, 
    isCrawling,
    triggerImport,
    isTriggering 
  } = useSitemapImport(brandId, domain);
  
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState(savedSitemapUrl || `https://${domain}/sitemap.xml`);

  const handleCrawlSite = async () => {
    try {
      await triggerCrawl();
      setImportModalOpen(false);
      toast.success('Site crawl started');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start crawl');
    }
  };

  const handleSitemapImport = async () => {
    try {
      await triggerImport(sitemapUrl);
      setImportModalOpen(false);
      toast.success('Sitemap import started');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start import');
    }
  };

  const getStatusMessage = () => {
    if (!job) return null;
    
    switch (job.status) {
      case 'pending':
        return 'Waiting to start...';
      case 'parsing':
        return 'Parsing sitemap...';
      case 'crawling':
        return 'Discovering all pages...';
      case 'crawling_nav':
        return 'Discovering navigation links...';
      case 'fetching_titles':
        return 'Fetching page titles...';
      case 'generating_embeddings':
        return 'Processing page titles...';
      case 'complete':
        return 'Import complete';
      case 'failed':
        return `Import failed: ${job.error_message || 'Unknown error'}`;
      default:
        return job.status;
    }
  };

  const getProgress = () => {
    if (!job || !job.urls_found) return 0;
    if (job.status === 'complete') return 100;
    if (job.status === 'generating_embeddings') {
      return 80 + (job.urls_processed / job.urls_found) * 20;
    }
    if (job.status === 'crawling') {
      return (job.urls_processed / Math.max(job.urls_found, 1)) * 60;
    }
    return (job.urls_processed / job.urls_found) * 80;
  };

  const isProcessing = isCrawling || isTriggering;

  // Compact mode - just show button
  if (compact) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setImportModalOpen(true)} disabled={isRunning}>
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Crawling...
            </>
          ) : isComplete ? (
            <>
              <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
              Re-crawl
            </>
          ) : isFailed ? (
            <>
              <AlertCircle className="w-4 h-4 mr-1 text-destructive" />
              Retry
            </>
          ) : (
            <>
              <Globe className="w-4 h-4 mr-1" />
              Crawl Site
            </>
          )}
        </Button>
        
        <CrawlDialog
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          domain={domain}
          isRunning={isRunning}
          isProcessing={isProcessing}
          job={job}
          getProgress={getProgress}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          sitemapUrl={sitemapUrl}
          setSitemapUrl={setSitemapUrl}
          onCrawl={handleCrawlSite}
          onSitemapImport={handleSitemapImport}
        />
      </>
    );
  }

  // No job and not running - show initial state
  if (!job && !isRunning) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-dashed border-border/50 bg-muted/30">
        <div>
          <p className="text-sm font-medium">Discover Site Links</p>
          <p className="text-xs text-muted-foreground">
            Crawl your site to index all products, collections, and pages
          </p>
        </div>
        <Button size="sm" onClick={() => setImportModalOpen(true)}>
          <Globe className="w-4 h-4 mr-2" />
          Crawl Site
        </Button>
        
        <CrawlDialog
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          domain={domain}
          isRunning={isRunning}
          isProcessing={isProcessing}
          job={job}
          getProgress={getProgress}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          sitemapUrl={sitemapUrl}
          setSitemapUrl={setSitemapUrl}
          onCrawl={handleCrawlSite}
          onSitemapImport={handleSitemapImport}
        />
      </div>
    );
  }

  // Show running or recent job status
  return (
    <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isComplete && <CheckCircle className="w-4 h-4 text-green-500" />}
          {isFailed && <AlertCircle className="w-4 h-4 text-destructive" />}
          <span className="text-sm font-medium">Site Crawl</span>
        </div>
        {!isRunning && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setImportModalOpen(true)}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Re-crawl
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{getStatusMessage()}</p>

      {isRunning && job && job.urls_found > 0 && (
        <>
          <Progress value={getProgress()} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {job.urls_processed} / {job.urls_found} pages processed
          </p>
        </>
      )}

      {isComplete && job && (
        <p className="text-xs text-muted-foreground">
          Found {job.product_urls_count} products, {job.collection_urls_count} collections
          {job.completed_at && (
            <span className="text-muted-foreground/60">
              {' '}• {formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}
            </span>
          )}
        </p>
      )}

      {isFailed && (
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => setImportModalOpen(true)}
        >
          Retry Crawl
        </Button>
      )}

      <CrawlDialog
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        domain={domain}
        isRunning={isRunning}
        isProcessing={isProcessing}
        job={job}
        getProgress={getProgress}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        sitemapUrl={sitemapUrl}
        setSitemapUrl={setSitemapUrl}
        onCrawl={handleCrawlSite}
        onSitemapImport={handleSitemapImport}
      />
    </div>
  );
}

// Extract dialog to a separate component to reduce duplication
interface CrawlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  isRunning: boolean;
  isProcessing: boolean;
  job: any;
  getProgress: () => number;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  sitemapUrl: string;
  setSitemapUrl: (url: string) => void;
  onCrawl: () => void;
  onSitemapImport: () => void;
}

function CrawlDialog({
  open,
  onOpenChange,
  domain,
  isRunning,
  isProcessing,
  job,
  getProgress,
  showAdvanced,
  setShowAdvanced,
  sitemapUrl,
  setSitemapUrl,
  onCrawl,
  onSitemapImport,
}: CrawlDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crawl Site</DialogTitle>
          <DialogDescription>
            We'll discover all products, collections, and pages on {domain}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Our crawler will scan your entire website to find all linkable pages, including:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Product pages</li>
            <li>Collection pages</li>
            <li>Content pages (recipes, about, FAQ, etc.)</li>
            <li>Navigation and footer links</li>
          </ul>

          {isRunning && job && job.urls_found > 0 && (
            <div className="space-y-2">
              <Progress value={getProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {job.urls_processed} / {job.urls_found} pages processed
              </p>
            </div>
          )}

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Advanced: Import from Sitemap</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                If you prefer, you can import from a sitemap URL instead of crawling:
              </p>
              <Input
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onSitemapImport} 
                disabled={isProcessing || isRunning || !sitemapUrl}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Import from Sitemap'
                )}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCrawl} disabled={isProcessing || isRunning}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 mr-2" />
                Crawl Site
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
