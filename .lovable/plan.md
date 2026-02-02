
# Fix Link Crawling: Cancel, Retry, and Status Indicators

## Problem Summary

The link crawling functionality has several critical issues:

1. **Jobs get permanently stuck**: Edge function timeouts leave jobs in "crawling" state forever
2. **No cancel/retry**: Users can't restart a stuck job because the system blocks re-triggers
3. **No real-time status**: Polling every 3 seconds, but no way to know if the backend actually died
4. **Stale job detection**: Jobs from 2-3 days ago still show as "running"

**Evidence from database:**
```
4 stuck jobs with no activity for 2-3 days:
- b98b9493: status=crawling, 74/203 processed, last update Jan 31
- cbdf5787: status=crawling, 26/62 processed, last update Jan 31
- 108fa629: status=crawling, 48/172 processed, last update Jan 30
- e6aa7580: status=fetching_titles, 244/402 processed, last update Jan 30
```

---

## Root Cause Analysis

### 1. Edge Function Timeout
The `crawl-brand-site` function:
- Polls Firecrawl every 5 seconds for up to 5 minutes (line 103-139)
- Then generates embeddings in batches (line 192-255)
- Total runtime can exceed Supabase's 150-second idle timeout

When timeout occurs, the job stays stuck because no error is recorded.

### 2. No Stale Job Detection
The trigger function checks for "running" jobs but doesn't consider how OLD they are:
```typescript
// Current check - blocks retry on ANY "running" job, even stale ones
const { data: existingJob } = await supabase
  .from('sitemap_import_jobs')
  .select('id, status')
  .eq('brand_id', brand_id)
  .in('status', ['pending', 'parsing', 'crawling', ...])
  .single();

if (existingJob) {
  throw new Error('An import is already in progress');
}
```

### 3. No Cancel Mechanism
There's no way for users to manually mark a stuck job as failed and restart.

---

## Solution

### Phase 1: Add Stale Job Detection and Auto-Cleanup

Jobs that haven't been updated in 10 minutes should be considered "stale" and auto-marked as failed.

**Changes to `useSitemapImport.ts`:**
- Add stale detection based on `updated_at` timestamp
- If job is "running" but hasn't been updated in 10 minutes, mark it as stale

**Changes to `trigger-sitemap-import`:**
- Before blocking, check if existing "running" job is actually stale
- If stale (updated_at > 10 minutes ago), mark it as failed and allow new trigger

### Phase 2: Add Cancel Button

**Changes to `SitemapImportCard.tsx`:**
- Add "Cancel" button when job is running
- Cancel sets status to "cancelled" (new status) with error message

**Changes to `useSitemapImport.ts`:**
- Add `cancelJob` mutation that updates job status to "cancelled"

### Phase 3: Enhanced Status Indicators

**Changes to `SitemapImportCard.tsx`:**
- Show elapsed time since job started
- Show warning if job hasn't progressed in 2+ minutes
- Add visual indicator for potentially stuck jobs
- Show "Retry" button for stale/stuck jobs

### Phase 4: Self-Chaining for Long Crawls

Implement the recommended pattern from Stack Overflow: break the crawl into smaller chunks that self-chain to avoid timeouts.

**Changes to `crawl-brand-site`:**
- Save incrementally after each batch of embeddings
- If approaching timeout, record progress and trigger continuation
- Use `EdgeRuntime.waitUntil()` for fire-and-forget completion

---

## Implementation Details

### Updated Job Status Types

```typescript
// types/link-intelligence.ts
export interface SitemapImportJob {
  // ... existing fields ...
  status: 'pending' | 'parsing' | 'crawling' | 'crawling_nav' | 
          'fetching_titles' | 'generating_embeddings' | 
          'complete' | 'failed' | 'cancelled' | 'stale'; // Add cancelled, stale
}
```

### Stale Detection Hook

```typescript
// useSitemapImport.ts
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function useSitemapImport(brandId: string, domain?: string) {
  // ... existing code ...

  const job = jobQuery.data;
  
  // Calculate if job is stale
  const isStale = useMemo(() => {
    if (!job || !RUNNING_STATUSES.includes(job.status)) return false;
    const lastUpdate = new Date(job.updated_at).getTime();
    const now = Date.now();
    return (now - lastUpdate) > STALE_THRESHOLD_MS;
  }, [job]);

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('sitemap_import_jobs')
        .update({ 
          status: 'cancelled',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString()
        })
        .eq('id', job!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sitemap-import-job', brandId] });
    },
  });

  return {
    // ... existing returns ...
    isStale,
    cancelJob: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}
```

### Updated SitemapImportCard UI

```tsx
// SitemapImportCard.tsx

function SitemapImportCard({ ... }) {
  const { 
    job, isRunning, isComplete, isFailed, isStale,
    triggerCrawl, isCrawling,
    cancelJob, isCancelling
  } = useSitemapImport(brandId, domain);

  const getElapsedTime = () => {
    if (!job?.started_at) return null;
    return formatDistanceToNow(new Date(job.started_at), { addSuffix: false });
  };

  const getLastActivity = () => {
    if (!job?.updated_at) return null;
    return formatDistanceToNow(new Date(job.updated_at), { addSuffix: true });
  };

  // Enhanced status with stale warning
  const getStatusMessage = () => {
    if (isStale) {
      return '⚠️ Job appears stuck - no activity in 10+ minutes';
    }
    // ... existing status messages ...
  };

  // In the running state UI:
  {isRunning && (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">Running for {getElapsedTime()}</span>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={cancelJob}
          disabled={isCancelling}
        >
          {isCancelling ? <Loader2 className="animate-spin" /> : 'Cancel'}
        </Button>
      </div>
      
      {isStale && (
        <Alert variant="warning">
          <AlertTriangle className="w-4 h-4" />
          <span>No progress in {getLastActivity()}. Try cancelling and restarting.</span>
        </Alert>
      )}
      
      <Progress value={getProgress()} />
      <p className="text-xs text-muted-foreground">
        {job.urls_processed} / {job.urls_found} pages
        <span className="text-muted-foreground/60"> • Last activity {getLastActivity()}</span>
      </p>
    </div>
  )}
}
```

### Trigger Function: Allow Retry on Stale Jobs

```typescript
// trigger-sitemap-import/index.ts

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// Check if there's already a running import for this brand
const { data: existingJob } = await supabase
  .from('sitemap_import_jobs')
  .select('id, status, updated_at')
  .eq('brand_id', brand_id)
  .in('status', ['pending', 'parsing', 'crawling', 'crawling_nav', 'fetching_titles', 'generating_embeddings'])
  .single();

if (existingJob) {
  // Check if job is stale
  const lastUpdate = new Date(existingJob.updated_at).getTime();
  const isStale = (Date.now() - lastUpdate) > STALE_THRESHOLD_MS;
  
  if (isStale) {
    // Mark stale job as failed and allow new trigger
    console.log(`[trigger-sitemap-import] Marking stale job ${existingJob.id} as failed`);
    await supabase
      .from('sitemap_import_jobs')
      .update({ 
        status: 'failed',
        error_message: 'Job timed out - no activity for 10+ minutes'
      })
      .eq('id', existingJob.id);
  } else {
    throw new Error('An import is already in progress for this brand');
  }
}
```

### Crawl Function: Incremental Saves

```typescript
// crawl-brand-site/index.ts

// Save each batch immediately after processing (not at the end)
for (let i = 0; i < uniqueLinks.length; i += batchSize) {
  const batch = uniqueLinks.slice(i, i + batchSize);
  
  // ... generate embeddings ...
  
  // IMMEDIATE SAVE after each batch
  await supabase
    .from('brand_link_index')
    .upsert(insertData, { onConflict: 'brand_id,url', ignoreDuplicates: false });
  
  processedCount += batch.length;
  
  // Update progress so we know the job is alive
  await supabase
    .from('sitemap_import_jobs')
    .update({ 
      urls_processed: processedCount,
      updated_at: new Date().toISOString() // Force update timestamp
    })
    .eq('id', job_id);
  
  console.log(`[crawl-brand-site] Saved batch ${Math.floor(i / batchSize) + 1}, ${processedCount}/${uniqueLinks.length}`);
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/link-intelligence.ts` | Add 'cancelled' and 'stale' status options |
| `src/hooks/useSitemapImport.ts` | Add isStale detection, cancelJob mutation |
| `src/components/brand/SitemapImportCard.tsx` | Add Cancel button, elapsed time, stale warning |
| `supabase/functions/trigger-sitemap-import/index.ts` | Allow retry on stale jobs |
| `supabase/functions/crawl-brand-site/index.ts` | Force update timestamp on each batch save |

---

## Database Cleanup

After deploying, run this SQL to clean up the 4 stuck jobs:

```sql
UPDATE sitemap_import_jobs 
SET status = 'failed', 
    error_message = 'Job timed out - marked as stale during cleanup',
    completed_at = NOW()
WHERE status IN ('crawling', 'fetching_titles', 'generating_embeddings')
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

---

## Expected Outcome

1. **Stuck jobs auto-recover**: Jobs with no activity for 10+ minutes get auto-marked as failed
2. **Cancel button**: Users can manually cancel running jobs
3. **Retry works**: Stale/failed jobs don't block new crawl attempts
4. **Status visibility**: 
   - Shows elapsed time
   - Shows last activity timestamp
   - Warns when job appears stuck
5. **Incremental progress**: Each batch saved immediately, so partial crawls aren't lost on timeout
