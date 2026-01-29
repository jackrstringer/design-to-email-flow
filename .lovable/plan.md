

# Fix Processing Timer Display

## Problem
The timer shows "1382m 35s" instead of "~1m 45s" because:
1. It calculates elapsed time from `created_at` to **current time** (`Date.now()`)
2. For completed campaigns, it should show `completed_at - created_at`, not `now - created_at`
3. The timer never "freezes" at the final duration

## Root Cause
The `ProcessingTimer` component always uses:
```typescript
const now = Date.now();
setElapsed(Math.floor((now - start) / 1000));
```

For completed items (status !== 'processing'), it should use the completion timestamp instead of `now`.

---

## Solution

### Option A: Use `updated_at` (No DB Migration)
The `updated_at` field is already being set when processing completes. We can use it as the "end time" for completed campaigns.

**Pros:**
- No database changes needed
- Works immediately for existing records
- `updated_at` is already populated with the correct completion time

**Cons:**
- If someone edits a field later, `updated_at` changes (but timers are mainly for debugging)

### Option B: Add `processing_completed_at` Column (Cleaner)
Add a dedicated timestamp that's set exactly when status → 'ready_for_review'.

---

## Recommended: Option A (Quick Fix)

### Changes to `ProcessingTimer.tsx`

```typescript
interface ProcessingTimerProps {
  createdAt: string | null;
  completedAt: string | null;  // NEW: pass updated_at
  status: string | null;
  visible: boolean;
  onToggle: () => void;
}

export function ProcessingTimer({ createdAt, completedAt, status, visible, onToggle }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!createdAt) return;

    const start = new Date(createdAt).getTime();
    
    // For completed items, calculate against completion time (not now)
    const isCompleted = status !== 'processing';
    
    if (isCompleted && completedAt) {
      // Frozen duration: completed_at - created_at
      const end = new Date(completedAt).getTime();
      setElapsed(Math.floor((end - start) / 1000));
      // No interval needed - duration is fixed
    } else {
      // Still processing: tick against current time
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));

      if (status === 'processing') {
        const interval = setInterval(() => {
          setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [createdAt, completedAt, status]);

  // ... rest unchanged
}
```

### Changes to `QueueRow.tsx`

```typescript
<ProcessingTimer
  createdAt={item.created_at}
  completedAt={item.updated_at}  // Pass updated_at as completion time
  status={item.status}
  visible={showTimers}
  onToggle={onToggleTimers}
/>
```

---

## Expected Result

| Before | After |
|--------|-------|
| Timer shows 1382m 35s (time since creation) | Timer shows ~1m 45s (actual processing duration) |
| Timer keeps counting forever | Timer freezes at completion time |
| Confusing for debugging | Accurate performance metric |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/queue/ProcessingTimer.tsx` | Add `completedAt` prop, fix elapsed calculation |
| `src/components/queue/QueueRow.tsx` | Pass `item.updated_at` as `completedAt` |

---

## Verification

After fix, the timers should show realistic durations like:
- Simple campaigns: ~60-90 seconds
- Complex campaigns: ~90-120 seconds

Instead of 1382m+ (days since creation).

