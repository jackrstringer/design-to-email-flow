
# Footer-Specific Slicing Pipeline

## Problem Analysis

The current `auto-slice-v2` prompt is designed for full campaign emails. It:
1. Searches for where "marketing content ends and utility content begins"
2. Sets `footerStartY` to exclude the footer from slices
3. Treats footer sections as non-marketing content to skip

**For standalone footer images**, this is completely wrong:
- The ENTIRE image is footer content
- Social icons ARE the content (not utility to skip)
- Fine print IS a slice (to be converted to HTML later)
- There's no "marketing content" to separate from

## Solution Architecture

### Phase 1: Footer-Specific Prompt in `auto-slice-v2`

When `isFooterMode: true` is passed, use a completely different Claude prompt:

```text
You are analyzing an EMAIL FOOTER screenshot to slice it into component sections.

## CONTEXT: This is a standalone footer image
The entire image is a footer - there is no marketing content above. Your job is to:
1. Slice ALL sections (logo, navigation, social icons, fine print)
2. Each slice becomes either an IMAGE link or (for fine print) HTML text
3. The "fine print" section will be converted to responsive HTML after slicing

## Footer Section Types

### IMAGE-BASED SECTIONS (keep as images):
- **Logo section**: Brand logo, typically at top
- **Navigation links**: "Shop | About | Contact" or vertical nav stacks
- **Social icons row**: Instagram, Facebook, TikTok, YouTube icons
- **CTA buttons**: "Join Facebook Group", "Shop Now", etc.
- **Badge rows**: B Corp, Vegan, Cruelty Free certifications

### FINE PRINT SECTION (will become HTML):
Look for the section containing ANY of these:
- "Unsubscribe" or "Manage Preferences" links
- Physical mailing address (city, state, zip)
- "© 2024 Brand Name" or "All rights reserved"
- "You are receiving this because..."
- Email: contact@brand.com

**Label this section as "fine_print"** - it will be converted to HTML.

## Slicing Rules for Footers

1. **Include ALL sections** - nothing is skipped
2. **Fine print is its own slice** - always the bottom section
3. **Social icons need horizontal split** - each icon is clickable
4. **Navigation links need horizontal split** - each link is clickable
5. **Logo is clickable** - links to homepage
6. **Badge rows are NOT clickable** - decorative only

## Output

Set `footerStartY = imageHeight` (the entire image is footer content)

Return slices covering the FULL image from yTop: 0 to yBottom: imageHeight

Each slice must have:
- name: Descriptive name (e.g., "logo", "navigation_links", "social_icons", "fine_print")
- yTop/yBottom: Pixel boundaries
- isClickable: true/false
- hasCTA: true if contains buttons
- horizontalSplit: For social icons and nav links
```

### Phase 2: Fine Print Detection in Process Flow

After slicing, the pipeline will:
1. Identify the slice named `fine_print` (or detect via OCR keywords)
2. Store its pixel boundaries for reference
3. **Convert it to HTML** using existing `LegalSectionData` structure:
   - Extract background color and text color from that region
   - Generate Klaviyo-compatible HTML with merge tags:
     - `{{ organization.name }}`
     - `{{ organization.address }}`
     - `{% unsubscribe_url %}`
     - `{% manage_preferences_url %}`

### Phase 3: Store Both in Job

The `footer_processing_jobs` table already has:
- `slices` (JSONB) - for image slices
- `legal_section` (JSONB) - for fine print metadata

After processing:
```json
{
  "slices": [
    { "name": "logo", "imageUrl": "...", "link": "https://brand.com", ... },
    { "name": "social_icons", "horizontalSplit": { "columns": 4 }, ... },
    // NO fine_print slice here - it's converted to HTML
  ],
  "legal_section": {
    "yStart": 450,
    "backgroundColor": "#1a1a1a",
    "textColor": "#ffffff",
    "detectedElements": [...]
  }
}
```

### Phase 4: Studio Display

The `ImageFooterStudio` already handles this:
1. Image slices shown with link/alt editors
2. Legal section shown as editable HTML preview
3. User can customize colors, padding, text

---

## Implementation Steps

### Step 1: Add Footer-Specific Prompt to `auto-slice-v2`

**File: `supabase/functions/auto-slice-v2/index.ts`**

1. Accept `isFooterMode` parameter in the request
2. Build a different prompt when `isFooterMode: true`
3. Key differences:
   - No "footer detection" - entire image IS footer
   - Slice covers full image (yTop: 0 to yBottom: imageHeight)
   - Identify `fine_print` section by name
   - Social icons and nav links ALWAYS get horizontal split

### Step 2: Update `process-footer-queue` to Handle Fine Print

**File: `supabase/functions/process-footer-queue/index.ts`**

1. After auto-slice returns, find the slice named "fine_print"
2. Use existing `detectLegalSection` OCR to extract metadata
3. Remove fine_print from image slices (it becomes HTML)
4. Store remaining slices + legal section in job

### Step 3: Ensure Social Icons Are Split

The prompt explicitly instructs:
- Social icon rows → `horizontalSplit: { columns: N }`
- Each icon gets its own clickable column
- Links can be set to platform URLs (instagram.com/brand, etc.)

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/auto-slice-v2/index.ts` | Add footer-specific prompt when `isFooterMode: true` |
| `supabase/functions/process-footer-queue/index.ts` | Handle fine_print slice → convert to legal section |

---

## Technical Details

### Footer Prompt Key Sections

```typescript
const footerPrompt = `
You are analyzing an EMAIL FOOTER screenshot to slice it into component sections.

## CRITICAL CONTEXT
This is a STANDALONE FOOTER IMAGE. The entire image is footer content.
There is no "marketing content" above - you are slicing the footer itself.

## Your Task
Slice this footer into its component sections:
1. Logo (if present) - typically clickable, links to homepage
2. Navigation links - horizontal or vertical, each link is clickable
3. Social media icons - MUST use horizontalSplit, each icon is clickable
4. CTA buttons - "Join Facebook Group", etc.
5. Badge/certification rows - usually not clickable
6. Fine print - the legal text section (name it "fine_print")

## Fine Print Detection
The "fine_print" section contains legal/compliance content:
- Unsubscribe link text
- Physical mailing address
- Copyright notice
- "You're receiving this email because..."

**IMPORTANT**: Name this slice exactly "fine_print" - it will be converted to HTML.

## Output Requirements
- footerStartY: Set to image height (entire image is footer)
- Slices: Cover FULL image from y=0 to y=imageHeight
- Social icons: ALWAYS use horizontalSplit with correct column count
- Navigation links: Use horizontalSplit if arranged horizontally
- Fine print: Must be its own slice at the bottom
`;
```

### Fine Print Slice Handling

In `process-footer-queue`:
```typescript
// Find the fine_print slice
const finePrintSlice = slices.find(s => 
  s.name.toLowerCase().includes('fine_print') || 
  s.name.toLowerCase().includes('legal')
);

if (finePrintSlice) {
  // Use OCR to extract legal section metadata
  const legalSection = await detectLegalSection(imageBase64, imageHeight);
  
  // Override yStart with Claude's more accurate boundary
  if (legalSection) {
    legalSection.yStart = finePrintSlice.yTop;
  }
  
  // Remove fine_print from image slices
  const imageSlices = slices.filter(s => s !== finePrintSlice);
  
  // Store both
  await updateJob(supabase, jobId, {
    slices: generateSliceCropUrls(imageSlices, ...),
    legal_section: legalSection
  });
}
```

---

## Expected Outcome

After implementation:

1. **Footer images are fully sliced** - including social icons, nav links, logo
2. **Social icons appear as individual columns** - each links to platform
3. **Fine print becomes editable HTML** - with Klaviyo merge tags
4. **Studio shows complete footer** - image slices + HTML legal section
5. **User can customize** - links, alt text, legal section colors/text
