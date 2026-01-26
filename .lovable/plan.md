

# Fix: Link Column Expands Leftward Without Compressing Image

## Problem Analysis

Looking at the screenshots, the issue is clear:
- Link buttons are truncated (e.g., "https://iamgia.com/products/blare-hoodie-black-psy...")
- The image column appears compressed
- There's plenty of whitespace on the left that isn't being utilized

### Root Cause

The row container uses `flex justify-center items-stretch`, which centers the combined width of:
- Link Column (left) - `flex-shrink-0 min-w-[120px]`
- Image Column (center) - `flex-shrink-0 style={{ width: scaledWidth }}`
- Alt Text Column (right) - `flex-shrink-0 w-[280px]`

With `justify-center`, all three columns are centered as a unit. Even though the link column has `min-w-[120px]` (not fixed), the entire row structure prevents it from growing leftward because:
1. All columns use `flex-shrink-0`
2. The centering behavior treats them as a single block
3. The link buttons inherit the column's constrained width

### Solution: Anchor the Image in the Center

Change the layout so the image column is anchored at the center, while the side columns fill available space on either side. This allows the link column to expand leftward naturally.

**New Layout Model:**
```
[  Link Column (flex-1, right-aligned content)  ] [Image (fixed)] [  Alt Column (flex-1)  ]
```

## Changes to `src/components/queue/ExpandedRowPanel.tsx`

### 1. Update Row Container (line 743)

**Current:**
```tsx
"relative flex justify-center items-stretch group/row"
```

**Change to:**
```tsx
"relative flex items-stretch group/row"
```

Remove `justify-center` since we'll use `flex-1` on the side columns to distribute space instead.

### 2. Update Link Column (line 764)

**Current:**
```tsx
<div className="flex flex-col justify-center py-1 pr-3 gap-1 items-end flex-shrink-0 min-w-[120px]">
```

**Change to:**
```tsx
<div className="flex-1 flex flex-col justify-center py-1 pr-3 gap-1 items-end min-w-[120px]">
```

- Add `flex-1` so the column expands to fill available left space
- Remove `flex-shrink-0` since we want it to grow
- Keep `items-end` so buttons remain right-aligned (grow leftward)
- Keep `min-w-[120px]` as a safety minimum

### 3. Update Alt Text Column (line 987)

**Current:**
```tsx
<div className="flex flex-col justify-center py-1 pl-3 gap-1 flex-shrink-0 w-[280px]">
```

**Change to:**
```tsx
<div className="flex-1 flex flex-col justify-center py-1 pl-3 gap-1 min-w-[120px] max-w-[280px]">
```

- Add `flex-1` for symmetric layout
- Remove `flex-shrink-0` and fixed `w-[280px]`
- Use `min-w-[120px]` and `max-w-[280px]` to constrain the alt text area

### 4. Add Spacer When displayMode is 'none' (after line 858)

When the link column is hidden (`displayMode === 'none'`), we need a spacer to maintain the centered image position:

**After line 858 (closing of link column), add:**
```tsx
{displayMode === 'none' && (
  <div className="flex-1" />
)}
```

### 5. Add Spacer When displayMode is 'links' (after line 983)

When the alt text column is hidden (`displayMode !== 'all'`), add a matching right spacer:

**After line 983 (closing of image column), before the alt text column:**
```tsx
{displayMode !== 'all' && (
  <div className="flex-1" />
)}
```

### 6. Update Footer Section for Consistency (line 1025)

The footer section should also adapt to use the same centered layout pattern:

**Current:**
```tsx
<div className="flex justify-center">
```

This can remain as-is since the footer doesn't have side columns.

## Summary of Changes

| Location | Current | Updated |
|----------|---------|---------|
| Line 743 (row container) | `flex justify-center items-stretch` | `flex items-stretch` |
| Line 764 (link column) | `flex-shrink-0 min-w-[120px]` | `flex-1 min-w-[120px]` |
| After line 858 | - | Add left spacer when `displayMode === 'none'` |
| After line 983 | - | Add right spacer when `displayMode !== 'all'` |
| Line 987 (alt column) | `flex-shrink-0 w-[280px]` | `flex-1 min-w-[120px] max-w-[280px]` |

## Expected Result

- The image column remains fixed-width and stays centered in the available space
- The link column expands leftward to fit full URLs without truncation
- Right-aligned link buttons grow into available left space naturally
- Alt text column has bounded growth (max 280px) for consistency
- All three display modes (All/Links/None) maintain proper centering via flex spacers
- No more compressed images or truncated links

## Visual Before/After

**Before:**
```
                    [link(truncated)] [Image] [Alt Text]
                    (everything centered as unit, link clipped)
```

**After:**
```
[      full link text right-aligned] [Image] [Alt Text   ]
(image centered, side columns fill space)
```

