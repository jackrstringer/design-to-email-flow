import { useState } from 'react';
import { Loader2, Download, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
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
  const { job, isRunning, isComplete, isFailed, triggerImport, isTriggering } = useSitemapImport(brandId);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState(savedSitemapUrl || `https://${domain}/sitemap.xml`);

  const handleTriggerImport = async () => {
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
      case 'fetching_titles':
        return 'Fetching page titles...';
      case 'generating_embeddings':
        return 'Generating embeddings...';
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
      // Rough estimate: processing is ~80% done when generating embeddings
      return 80 + (job.urls_processed / job.urls_found) * 20;
    }
    return (job.urls_processed / job.urls_found) * 80;
  };

  // Show nothing if no job and not in a relevant state
  if (!job && !isRunning) {
    // Compact mode - just show button
    if (compact) {
      return (
        <>
          <Button size="sm" variant="outline" onClick={() => setImportModalOpen(true)}>
            <Download className="w-4 h-4 mr-1" />
            Import
          </Button>
          
          <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import from Sitemap</DialogTitle>
                <DialogDescription>
                  Enter the URL of your sitemap. We'll index all products and collections.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleTriggerImport} disabled={isTriggering || !sitemapUrl}>
                  {isTriggering ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    'Start Import'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    return (
      <div className="flex items-center justify-between p-4 rounded-lg border border-dashed border-border/50 bg-muted/30">
        <div>
          <p className="text-sm font-medium">Import from Sitemap</p>
          <p className="text-xs text-muted-foreground">
            Index your products and collections for instant link matching
          </p>
        </div>
        <Button size="sm" onClick={() => setImportModalOpen(true)}>
          <Download className="w-4 h-4 mr-2" />
          Import
        </Button>
        
        <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import from Sitemap</DialogTitle>
              <DialogDescription>
                Enter the URL of your sitemap. We'll index all products and collections.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleTriggerImport} disabled={isTriggering || !sitemapUrl}>
                {isTriggering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Import'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Compact mode with job running
  if (compact) {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setImportModalOpen(true)} disabled={isRunning}>
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Importing...
            </>
          ) : isComplete ? (
            <>
              <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
              Re-import
            </>
          ) : isFailed ? (
            <>
              <AlertCircle className="w-4 h-4 mr-1 text-destructive" />
              Retry
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-1" />
              Import
            </>
          )}
        </Button>
        
        <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import from Sitemap</DialogTitle>
              <DialogDescription>
                Enter the URL of your sitemap. We'll index all products and collections.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
              />
              {isRunning && job && job.urls_found > 0 && (
                <div className="mt-4 space-y-2">
                  <Progress value={getProgress()} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {job.urls_processed} / {job.urls_found} URLs processed
                  </p>
                </div>
              )}
              {isComplete && job && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Last import: {job.product_urls_count} products, {job.collection_urls_count} collections
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleTriggerImport} disabled={isTriggering || isRunning || !sitemapUrl}>
                {isTriggering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Import'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
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
          <span className="text-sm font-medium">Sitemap Import</span>
        </div>
        {!isRunning && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setImportModalOpen(true)}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Re-import
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{getStatusMessage()}</p>

      {isRunning && job && job.urls_found > 0 && (
        <>
          <Progress value={getProgress()} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {job.urls_processed} / {job.urls_found} URLs processed
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
          Retry Import
        </Button>
      )}

      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Sitemap</DialogTitle>
            <DialogDescription>
              Enter the URL of your sitemap. We'll index all products and collections.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder="https://example.com/sitemap.xml"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTriggerImport} disabled={isTriggering || !sitemapUrl}>
              {isTriggering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Import'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
