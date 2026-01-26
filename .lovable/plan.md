

# Implementation Plan: Processing Timer + Fix Links/Alt Text Bug

## Part 1: Fix Links and Alt Text Failure

### Root Cause
The edge function `process-campaign-queue` still has **three places** using `h_7900` instead of `h_5000`:

| Location | Line | Current | Should Be |
|----------|------|---------|-----------|
| `startEarlyGeneration` | 128 | `getResizedCloudinaryUrl(imageUrl, 600, 7900)` | `600, 5000` |
| `fetchSliceDataUrlsForAnalysis` | 369 | `const aiMaxHeight = 7900` | `5000` |
| `analyzeSlices` | 422 | `getResizedCloudinaryUrl(fullImageUrl, 600, 7900)` | `600, 5000` |

The recent fix only updated line 87 but missed these three locations. When the full campaign image or slice dataUrls are fetched at the 7900px size, tall images aren't being re-encoded by Cloudinary, resulting in large PNGs that exceed Claude's 5MB base64 limit.

### Fix
Update all three locations in `supabase/functions/process-campaign-queue/index.ts`:

1. **Line 128**: Change `7900` to `5000`
2. **Line 369**: Change `7900` to `5000`  
3. **Line 422**: Change `7900` to `5000`

---

## Part 2: Processing Timer Feature

### Design
Add a small, unintrusive timer to the left of the status badge that:
- Starts counting when the campaign enters the queue (`created_at`)
- Stops and displays final time when status becomes `ready_for_review`
- Shows elapsed time in `Xm Xs` format (e.g., "1m 23s")
- Can be hidden by clicking on it (toggles visibility for all timers)
- Hidden state persists via localStorage for dev convenience

### UI Placement

```
[checkbox] [TIMER] [STATUS BADGE] [thumbnail] [name] ...
              ↑
         "1m 23s" in muted gray text, small font
```

### Components to Create/Modify

**1. New Component: `src/components/queue/ProcessingTimer.tsx`**

```tsx
interface ProcessingTimerProps {
  createdAt: string;
  status: CampaignQueueItem['status'];
  isHidden: boolean;
  onToggleVisibility: () => void;
}
```

Features:
- Uses `useState` with `setInterval` to update every second while status is `processing`
- Calculates elapsed time from `created_at` to now (or to `updated_at` when complete)
- Displays in compact format: `1m 23s` or `45s`
- Clickable area toggles global visibility state

**2. Modify: `src/components/queue/QueueRow.tsx`**

- Import `ProcessingTimer` component
- Add state management for timer visibility (lifted from localStorage)
- Add timer between checkbox and status columns
- Pass visibility toggle handler to timer

**3. Modify: `src/components/queue/QueueTable.tsx`**

- Add shared state for timer visibility: `const [showTimers, setShowTimers] = useState()`
- Initialize from localStorage on mount: `localStorage.getItem('queue-show-timers')`
- Pass `showTimers` and toggle function down to `QueueRow`

### Timer Logic

```typescript
// Calculate elapsed time
const startTime = new Date(createdAt).getTime();
const endTime = status === 'processing' 
  ? Date.now() 
  : new Date(updatedAt).getTime(); // Freeze at completion time

const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
const minutes = Math.floor(elapsedSeconds / 60);
const seconds = elapsedSeconds % 60;

// Format: "1m 23s" or "45s"
const display = minutes > 0 
  ? `${minutes}m ${seconds}s` 
  : `${seconds}s`;
```

### Styling
- Font: `text-[10px]` muted gray
- Non-intrusive: only visible on hover or when processing
- Clickable cursor to indicate toggle functionality

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-campaign-queue/index.ts` | Fix 3 instances of `7900` → `5000` |
| `src/components/queue/ProcessingTimer.tsx` | **New file** - Timer component |
| `src/components/queue/QueueRow.tsx` | Add timer between checkbox and status |
| `src/components/queue/QueueTable.tsx` | Add shared timer visibility state |

---

## Technical Details

### Timer Component Implementation

```typescript
// ProcessingTimer.tsx
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ProcessingTimerProps {
  createdAt: string;
  updatedAt: string;
  status: 'processing' | 'ready_for_review' | 'approved' | 'sent_to_klaviyo' | 'failed' | 'closed';
  isVisible: boolean;
  onToggle: () => void;
}

export function ProcessingTimer({ createdAt, updatedAt, status, isVisible, onToggle }: ProcessingTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    const startTime = new Date(createdAt).getTime();
    
    // If still processing, update every second
    if (status === 'processing') {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    
    // If complete, show final time (frozen)
    const endTime = new Date(updatedAt).getTime();
    setElapsed(Math.floor((endTime - startTime) / 1000));
  }, [createdAt, updatedAt, status]);
  
  if (!isVisible) {
    return (
      <div 
        className="w-12 flex-shrink-0 cursor-pointer" 
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      />
    );
  }
  
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  return (
    <div 
      className="w-12 flex-shrink-0 px-1 cursor-pointer"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <span className={cn(
        "text-[10px] tabular-nums",
        status === 'processing' ? "text-blue-500" : "text-gray-400"
      )}>
        {display}
      </span>
    </div>
  );
}
```

### QueueRow Integration

Add between checkbox and status columns:

```tsx
<ProcessingTimer
  createdAt={item.created_at}
  updatedAt={item.updated_at}
  status={item.status}
  isVisible={showTimers}
  onToggle={onToggleTimers}
/>
```

### QueueTable State Management

```tsx
const [showTimers, setShowTimers] = useState(() => {
  const stored = localStorage.getItem('queue-show-timers');
  return stored !== 'false'; // Default to visible
});

const handleToggleTimers = useCallback(() => {
  setShowTimers(prev => {
    const newValue = !prev;
    localStorage.setItem('queue-show-timers', String(newValue));
    return newValue;
  });
}, []);
```

