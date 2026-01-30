
# Fix Timer Column Misalignment

## Problem
The `ProcessingTimer` component adds a 40px column (`w-10`) in every `QueueRow`, but there's no corresponding column in the `QueueTable` header. This causes:
- Row content to be offset 40px to the right compared to headers
- Progressively worse visual misalignment across columns

## Solution
Add a matching timer column to the header in `QueueTable.tsx`.

### Changes to `src/components/queue/QueueTable.tsx`

**1. Add timer column to main header (after line 235, after the checkbox column):**

```typescript
{/* Timer column - matches ProcessingTimer width */}
<div 
  className="w-10 flex-shrink-0 flex items-center justify-center cursor-pointer text-[10px] text-gray-400"
  onClick={(e) => {
    e.stopPropagation();
    onToggleTimers();
  }}
>
  {showTimers && 'Time'}
</div>
```

**2. Add timer column to loading skeleton header (after line 172):**

```typescript
<div className="w-10 flex-shrink-0" /> {/* Timer column placeholder */}
```

**3. Add timer column to loading skeleton rows (after line 187):**

```typescript
<div className="w-10 flex-shrink-0" />
```

**4. Update minTableWidth calculation (line 216):**

```typescript
// +32 for checkbox + 40 for timer column
const minTableWidth = Object.values(columnWidths).reduce((sum, w) => sum + w, 0) + 32 + 40;
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/queue/QueueTable.tsx` | Add timer column header (4 locations) |

---

## Visual Result

| Before | After |
|--------|-------|
| Headers and cells misaligned by 40px | Headers and cells perfectly aligned |
| Timer invisible in header | "Time" label appears in header when timers visible |
| Clicking timer in row toggles globally | Header timer also clickable to toggle |
