
# Add Processing Timer to Queue Rows

## Overview
Add a small, minimal timer to the left of each queue row's status badge. The timer shows elapsed processing time and can be toggled on/off by clicking.

## Behavior
- **Start**: Timer starts counting from `created_at` timestamp when campaign enters queue
- **Stop**: Timer freezes when status reaches `ready_for_review` (or later states)
- **Format**: `Xm Xs` (e.g., "2m 34s")
- **Toggle**: Clicking any timer area toggles ALL timers visibility globally
- **Persistence**: Visibility preference stored in localStorage

## Files to Create/Modify

### 1. Create `src/components/queue/ProcessingTimer.tsx`
New component that:
- Accepts `createdAt` timestamp and `status`
- Uses `useEffect` + `setInterval` to tick every second while processing
- Calculates elapsed time from `createdAt`
- Freezes the time display once `status !== 'processing'`
- Renders a tiny, gray text display (e.g., "1m 23s")

### 2. Modify `src/components/queue/QueueRow.tsx`
- Import `ProcessingTimer`
- Add a narrow clickable area (w-10) between checkbox and status columns
- Pass `showTimers` and `onToggleTimers` from parent
- When clicked, toggle global visibility

### 3. Modify `src/components/queue/QueueTable.tsx`
- Add state: `const [showTimers, setShowTimers] = useState(() => localStorage.getItem('queueShowTimers') === 'true')`
- Pass `showTimers` and `onToggleTimers` to each `QueueRow`
- Save to localStorage on toggle

## Visual Design
- Timer width: ~40px
- Font: 10px, text-gray-400
- When hidden: the area is still clickable but shows nothing (invisible toggle zone)
- When visible: shows "2m 34s" style text
- No borders, no backgrounds - completely minimal

## Technical Details

```tsx
// ProcessingTimer.tsx
const ProcessingTimer = ({ createdAt, status, visible, onToggle }) => {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    // Calculate initial elapsed
    const start = new Date(createdAt).getTime();
    const now = Date.now();
    setElapsed(Math.floor((now - start) / 1000));
    
    // Only tick if still processing
    if (status === 'processing') {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [createdAt, status]);
  
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const display = `${minutes}m ${seconds}s`;
  
  return (
    <div onClick={(e) => { e.stopPropagation(); onToggle(); }} className="w-10 ...">
      {visible && <span className="text-[10px] text-gray-400">{display}</span>}
    </div>
  );
};
```
