
# Redesign Image Footer Studio to Match Queue Experience

## User Feedback Summary

1. **Use same slice display style as queue** - The current grid-based `SliceEditorGrid` is different from the queue's approach of showing slices stacked with links/alt-text overlaid alongside the image
2. **No need for side-by-side view** - Since it's image-based, the output will match the input. Instead, provide a toggle for "Original vs Render"
3. **Social media icons missing** - These should be sliced as images too, not removed
4. **Missing legal section prompt** - If no legal/fine print is detected, prompt user to add the required Klaviyo merge tags (org name, org address, unsubscribe link)

---

## Current vs Target Architecture

```text
CURRENT LAYOUT (Wrong):
┌───────────────────────────────────────────────────────────┐
│ ┌─────────────────────┐  ┌─────────────────────────────┐ │
│ │   Reference Image   │  │      HTML Preview           │ │
│ │  (Left 50%)         │  │      (Right 50%)            │ │
│ └─────────────────────┘  └─────────────────────────────┘ │
├───────────────────────────────────────────────────────────┤
│ SliceEditorGrid (grid of cards - WRONG STYLE)            │
├───────────────────────────────────────────────────────────┤
│ LegalSectionEditor (only shows if legal detected)        │
└───────────────────────────────────────────────────────────┘

TARGET LAYOUT (Match Queue ExpandedRowPanel):
┌───────────────────────────────────────────────────────────┐
│ Header: Back | Title | [Original ◀▶ Render] | Save       │
├───────────────────────────────────────────────────────────┤
│         [Link Col]     [Image]        [Alt Col]          │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ ➕ Add link  │  │ [Slice 1]   │  │ "Logo image"  │   │
│  └──────────────┘  └─────────────┘  └───────────────┘   │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ /shop-mens   │  │ [Slice 2]   │  │ "Shop Mens"   │   │
│  └──────────────┘  └─────────────┘  └───────────────┘   │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ Multi-col... │  │ [Socials]   │  │ "Social..."   │   │
│  └──────────────┘  └─────────────┘  └───────────────┘   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Legal Section (HTML) - always shows                 │ │
│  │ ⚠️ Missing legal? Click to add required fields     │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Phase 1: Restructure ImageFooterStudio Layout

**File: `src/pages/ImageFooterStudio.tsx`**

Replace the side-by-side layout with a single centered column that:
1. Shows a toggle for "Original" vs "Render" at the top
2. Renders slices stacked vertically with link/alt columns on sides (like ExpandedRowPanel)
3. Always shows legal section at bottom (with prompt if missing)

Key changes:
- Remove the two-panel split (left reference, right preview)
- Add view toggle state: `const [viewMode, setViewMode] = useState<'render' | 'original'>('render')`
- Reuse the same slice row layout from `ExpandedRowPanel`:
  - Left column: Link editor (Popover with Command for autocomplete)
  - Center: Slice image (stacked, full width at scaled size)
  - Right column: Alt text editor (click to edit)
- Add slice separator lines between rows
- Support multi-column display for horizontal splits (social icons)

### Phase 2: Add Missing Legal Section Prompt

**File: `src/pages/ImageFooterStudio.tsx`** and **`src/components/footer/LegalSectionEditor.tsx`**

When `legalSection` is null:
1. Show a warning banner with an "Add Legal Section" button
2. Clicking creates a default `LegalSectionData` with sensible defaults
3. Required fields reminder: org name, org address, unsubscribe link

New component structure:
```tsx
{legalSection ? (
  <LegalSectionEditor legalSection={legalSection} onUpdate={handleLegalUpdate} />
) : (
  <MissingLegalPrompt onAdd={handleAddLegalSection} />
)}
```

The `MissingLegalPrompt` component shows:
- Warning icon + message about required legal compliance
- "Add Legal Section" button that initializes a default `LegalSectionData`:
  ```typescript
  {
    yStart: 0,
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff',
    detectedElements: []
  }
  ```

### Phase 3: Delete SliceEditorGrid Component

The `SliceEditorGrid` component is no longer needed since we're adopting the queue's inline editing approach. The slice editing will be integrated directly into the `ImageFooterStudio` page.

**File: `src/components/footer/SliceEditorGrid.tsx`** - Delete or deprecate

### Phase 4: Ensure Social Icons Are Included

The current pipeline should already include social icons as slices since they're above the legal cutoff. Need to verify:
1. `process-footer-queue` includes all slices above `legalCutoffY`
2. Social icon rows are marked with `horizontalSplit` data for proper rendering
3. Multi-column rows display correctly in the new layout

If social icons are being excluded, check the `auto-slice-v2` function to ensure it's not filtering them out.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ImageFooterStudio.tsx` | **Major rewrite** | Replace side-by-side with queue-style stacked slices, add view toggle, add missing legal prompt |
| `src/components/footer/LegalSectionEditor.tsx` | **Minor update** | Keep color pickers but integrate into new layout |
| `src/components/footer/SliceEditorGrid.tsx` | **Delete** | No longer needed - slice editing moves inline |

---

## UI Component Details

### View Toggle (Header)
```tsx
<div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
  <button 
    onClick={() => setViewMode('original')}
    className={cn("px-3 py-1.5 rounded text-sm", viewMode === 'original' && "bg-background shadow-sm")}
  >
    Original
  </button>
  <button 
    onClick={() => setViewMode('render')}
    className={cn("px-3 py-1.5 rounded text-sm", viewMode === 'render' && "bg-background shadow-sm")}
  >
    Render
  </button>
</div>
```

### Slice Row (Same as ExpandedRowPanel)
- Left: Link editor with Popover/Command for autocomplete from `brand_link_index`
- Center: Image at scaled width with separator lines
- Right: Alt text with click-to-edit

### Legal Section Card
Always visible at bottom:
- If legal detected: Show color pickers + preview
- If no legal: Show warning + "Add Legal Section" button

---

## Expected Behavior After Implementation

1. User uploads footer image or pastes Figma link
2. Processing runs, slices the visual content (including social icons)
3. Studio opens with:
   - **Render view** (default): Shows sliced images stacked with link/alt editors
   - **Original view** (toggle): Shows the original uploaded image
4. User edits links/alt text inline (same UX as campaign queue)
5. User customizes legal section colors (or adds one if missing)
6. User saves footer to `brand_footers`
