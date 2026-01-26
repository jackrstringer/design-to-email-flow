
# Fix: Allow Link Buttons to Extend Full Width Without Clipping

## Problem
The link buttons in the expanded row panel's left column are being truncated with ellipsis ("https://iamgia.com/products/blare-hoodie-black-psy...") even though there is plenty of horizontal space available to the left.

## Root Cause
The link column has several constraints causing the truncation:

1. **Fixed column width**: `w-[280px]` (line 764)
2. **Button constrained to column**: `max-w-full overflow-hidden` (line 777)
3. **Text truncation**: `truncate` class on the link span (line 788)

Since the column is right-aligned (`items-end`) and the buttons are constrained to `max-w-full` of the 280px parent, they cannot extend leftward even when space is available.

## Solution
Remove the fixed width constraint and allow the link column to be flexible, letting links grow to their natural width. The column should use auto-sizing rather than a fixed 280px width.

### Changes to `src/components/queue/ExpandedRowPanel.tsx`

**1. Update left link column container (line 764)**

Current:
```tsx
<div className="flex flex-col justify-center py-1 pr-3 gap-1 items-end flex-shrink-0 w-[280px]">
```

Change to:
```tsx
<div className="flex flex-col justify-center py-1 pr-3 gap-1 items-end flex-shrink-0 min-w-[120px]">
```

This removes the fixed 280px width and adds a minimum width of 120px for empty/short link states. The column will now grow based on content.

**2. Update button styling for links (line 776-777)**

Current:
```tsx
<button className={cn(
  "flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] transition-colors text-left max-w-full overflow-hidden",
```

Change to:
```tsx
<button className={cn(
  "flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] transition-colors text-left",
```

Remove `max-w-full overflow-hidden` so the button can grow to fit its content.

**3. Update link text span (line 788)**

Current:
```tsx
<span className="text-muted-foreground truncate">{slice.link}</span>
```

Change to:
```tsx
<span className="text-muted-foreground whitespace-nowrap">{slice.link}</span>
```

Replace `truncate` with `whitespace-nowrap` so the link displays fully without wrapping or clipping.

## Summary of Changes

| Line | Current | Updated |
|------|---------|---------|
| 764 | `w-[280px]` | `min-w-[120px]` |
| 777 | `max-w-full overflow-hidden` | (removed) |
| 788 | `truncate` | `whitespace-nowrap` |

## Expected Result
- Link buttons will grow to fit the full URL text
- Links remain right-aligned (buttons extend leftward into available space)
- Minimum width ensures consistent layout when links are short/empty
- No ellipsis truncation on link URLs
