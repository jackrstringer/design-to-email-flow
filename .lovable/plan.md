
# Fix Timer Showing Incorrect Duration

## Problem
The timer is using `updated_at` as the completion timestamp, but `updated_at` changes **every time any field is modified** (subject line selection, sending to Klaviyo, etc.).

Evidence from database:
- Campaign created: `17:01:52`
- Campaign `updated_at`: `22:04:37` (5 hours later - after being sent to Klaviyo)
- Timer shows: `302m 45s` (the difference between those two times)

The other campaigns show correct times (1m 6s, 1m 44s, 1m 31s) because they haven't been edited since processing completed.

## Solution
Add a dedicated `processing_completed_at` column that gets set **exactly once** when the campaign transitions from `processing` to `ready_for_review`.

### Step 1: Database Migration
Add the new column:

```sql
ALTER TABLE campaign_queue 
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;
```

### Step 2: Update `process-campaign-queue` to set completion timestamp

In `supabase/functions/process-campaign-queue/index.ts`, when updating status to `ready_for_review` (around line 1050), also set `processing_completed_at`:

```typescript
await supabaseAdmin.from('campaign_queue').update({
  status: 'ready_for_review',
  processing_completed_at: new Date().toISOString(),
  // ... other fields
}).eq('id', item.id);
```

### Step 3: Update `ProcessingTimer` to use new field

In `src/components/queue/QueueRow.tsx`, pass the correct completion timestamp:

```typescript
<ProcessingTimer
  createdAt={item.created_at}
  completedAt={item.processing_completed_at}  // Changed from item.updated_at
  status={item.status}
  visible={showTimers}
  onToggle={onToggleTimers}
/>
```

### Step 4: Backfill existing completed campaigns

For campaigns that are already `ready_for_review` or later statuses but don't have `processing_completed_at` set, we can optionally run a one-time migration to copy `updated_at` to `processing_completed_at` for reasonable cases (where the times make sense).

Or simply accept that older campaigns will show incorrect times until they fall off the queue.

---

## Files to Modify

| File | Change |
|------|--------|
| Database migration | Add `processing_completed_at` column |
| `supabase/functions/process-campaign-queue/index.ts` | Set `processing_completed_at` when completing |
| `src/components/queue/QueueRow.tsx` | Pass `processing_completed_at` instead of `updated_at` |
| `src/hooks/useCampaignQueue.ts` | Include new column in type (if not auto-generated) |

---

## Expected Result

| Before | After |
|--------|-------|
| Timer shows 302m 45s (time since creation to last edit) | Timer shows ~1m 30s (actual processing duration) |
| Editing fields changes the timer | Timer is frozen at processing completion |
| Sending to Klaviyo inflates timer | Timer unaffected by post-processing actions |
