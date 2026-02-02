

# Image Footer Studio - Full Page Editing Experience

## Current Issue

The image-based footer processing correctly slices the footer and detects the legal section, but:

1. **Review step is cramped in a modal** - User can only see small slice thumbnails with basic editing
2. **No legal section HTML preview** - Even when detected, the legal HTML isn't shown as a live preview
3. **No AI refinement capability** - User can't request text edits to the legal section
4. **Missing full footer preview** - User can't see the combined output (slices + legal HTML) as one email-ready footer

## Solution

Create a dedicated **Image Footer Studio** page at `/footer-studio/:brandId/:jobId` that provides the same full-screen editing experience as `CampaignStudio`, but specialized for image-based footers:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back              Image Footer Studio              [Save Footer]         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │        Reference             │  │         Live Preview                │ │
│  │      (Original Image)        │  │      (HTML Output @ 600px)          │ │
│  │                              │  │                                     │ │
│  │  ┌────────────────────────┐  │  │  ┌─────────────────────────────┐   │ │
│  │  │ [O'Neill Logo]         │  │  │  │ [Cropped Slice 1]          │   │ │
│  │  │                        │  │  │  │ Alt: Brand logo             │   │ │
│  │  │ SHOP FOR HIM          │  │  │  │ Link: https://oneill.com    │   │ │
│  │  │ SHOP FOR HER          │  │  │  └─────────────────────────────┘   │ │
│  │  │ SALE FOR HIM          │  │  │  ┌─────────────────────────────┐   │ │
│  │  │ SALE FOR HER          │  │  │  │ [Cropped Slice 2]          │   │ │
│  │  │                        │  │  │  │ Alt: Shop for Him CTA      │   │ │
│  │  │ [Social Icons Row]    │  │  │  │ Link: /collections/mens    │   │ │
│  │  │                        │  │  │  └─────────────────────────────┘   │ │
│  │  │ ─── Legal Text ───    │  │  │  ┌─────────────────────────────┐   │ │
│  │  │ 123 Main St, City CA  │  │  │  │ [Legal Section - HTML]     │   │ │
│  │  │ Unsubscribe | Prefs   │  │  │  │ {{ organization.name }}    │   │ │
│  │  └────────────────────────┘  │  │  │ {{ organization.address }} │   │ │
│  │                              │  │  │ Unsubscribe | Preferences  │   │ │
│  └──────────────────────────────┘  │  └─────────────────────────────┘   │ │
│                                     │                                     │ │
├─────────────────────────────────────┴─────────────────────────────────────┤
│                           Slice Editor                                     │
├────────────────────────────────────────────────────────────────────────────┤
│  Slice 1: Header Logo                      Slice 2: Shop For Him CTA      │
│  ┌──────┐ Alt: [O'Neill logo with tagline] ┌──────┐ Alt: [Shop for Him]   │
│  │ img  │ Link: [https://oneill.com_____]  │ img  │ Link: [/mens_______]  │
│  └──────┘ ✓ Verified                       └──────┘ ✓ Verified             │
│                                                                            │
│  Slice 3: Shop For Her CTA                 Slice 4: Sale For Him CTA      │
│  ┌──────┐ Alt: [Shop for Her__________]    ┌──────┐ Alt: [Mens Sale____]  │
│  │ img  │ Link: [/womens______________]    │ img  │ Link: [/mens-sale__]  │
│  └──────┘ ✓ Verified                       └──────┘ ✓ Verified             │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                           Legal Section Editor                              │
├────────────────────────────────────────────────────────────────────────────┤
│  Background: [#1a1a1a] ▼   Text Color: [#ffffff] ▼                         │
│                                                                            │
│  Preview:                                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │ {{ organization.name }} | {{ organization.address }}               │   │
│  │                                                                    │   │
│  │ Unsubscribe | Manage Preferences                                   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  [Edit Legal Text...]   <- Opens chat dialog for AI text refinement       │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### New Route: `/footer-studio/:brandId/:jobId`

```text
FooterBuilderModal
     │
     │ (on job completion → status: pending_review)
     │
     └───► navigate('/footer-studio/:brandId/:jobId')
                │
                ├── Fetch job data from footer_processing_jobs
                ├── Fetch brand data for context
                │
                └── Render ImageFooterStudio
                         │
                         ├── Left Panel: Reference image
                         ├── Right Panel: Live HTML preview (CampaignPreviewFrame)
                         ├── Bottom: Slice editor grid
                         └── Legal section color/text editor
```

---

## Implementation Details

### Phase 1: New Page Component - `ImageFooterStudio`

**File: `src/pages/ImageFooterStudio.tsx`**

This page will:
1. Accept `brandId` and `jobId` from URL params
2. Fetch the job data (slices, legal section) from `footer_processing_jobs`
3. Fetch brand data for context
4. Allow inline editing of:
   - Slice alt text
   - Slice links (with autocomplete from brand_link_index)
   - Legal section colors
5. Generate live preview using existing `generateImageFooterHtml()` function
6. Save completed footer to `brand_footers`

### Phase 2: Update Modal Flow

**File: `src/components/FooterBuilderModal.tsx`**

When job reaches `pending_review` status:
- Instead of showing cramped "review" step in modal
- Navigate to `/footer-studio/:brandId/:jobId`
- Close modal

### Phase 3: Slice Editor Component

**File: `src/components/footer/SliceEditorGrid.tsx`**

A grid of editable slice cards showing:
- Slice thumbnail (64x64)
- Alt text input
- Link input with autocomplete
- Link verification status indicator

### Phase 4: Legal Section Editor

**File: `src/components/footer/LegalSectionEditor.tsx`**

- Color pickers for background and text
- Live preview of legal HTML block
- Optional AI refinement for custom text

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/ImageFooterStudio.tsx` | **Create** | Full-page footer studio for image-based footers |
| `src/components/footer/SliceEditorGrid.tsx` | **Create** | Grid of editable slice cards |
| `src/components/footer/LegalSectionEditor.tsx` | **Create** | Legal section color/text editor |
| `src/App.tsx` | **Modify** | Add route for `/footer-studio/:brandId/:jobId` |
| `src/components/FooterBuilderModal.tsx` | **Modify** | Navigate to studio on job completion |

---

## Key Features

1. **Side-by-side comparison**: Original image on left, generated HTML on right (same as CampaignStudio)

2. **Zoom-synchronized preview**: 25-150% zoom at 600px base width (matches Klaviyo standards)

3. **Inline slice editing**: Edit alt text and links directly in the grid

4. **Link autocomplete**: Suggest URLs from brand_link_index for faster editing

5. **Legal section customization**: Adjust colors to match the original, edit text structure

6. **Live preview**: See changes reflected instantly in the HTML preview

7. **Save action**: Generates final HTML and saves to brand_footers

---

## User Flow After Implementation

1. User opens Footer Builder Modal
2. Selects "Image Footer" route
3. Uploads image or pastes Figma link
4. Processing runs (~12-16 seconds)
5. **Modal closes → Studio opens**
6. User reviews full footer preview
7. Edits links/alt text as needed
8. Adjusts legal section colors if needed
9. Clicks "Save Footer"
10. Redirected to brand page with new footer listed

