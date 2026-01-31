
# Add Image-Based Footer Option to Footer Builder

## Overview

Currently, the footer builder only supports HTML generation - a complex process involving Vision analysis, Claude refinement loops, and pixel-perfect matching. This is proving difficult to achieve accurate results.

The new **Image-Based Footer** option provides a simpler, faster alternative:
1. User uploads a footer image
2. System runs the existing auto-slice pipeline to detect clickable regions
3. Each region becomes a linked image slice
4. The legal/compliance section (Unsubscribe, Address, Organization Name) is automatically detected and replaced with an HTML snippet using Klaviyo merge tags

```text
USER FLOW:

┌─────────────────────────────────────────────────────────────────────┐
│                    Footer Builder Modal                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   How would you like to create your footer?                         │
│                                                                     │
│   ┌─────────────────────┐    ┌─────────────────────┐                │
│   │    📝 HTML Footer    │    │   🖼️ Image Footer   │                │
│   │                     │    │                     │                │
│   │  More flexible      │    │  Faster setup       │                │
│   │  Best practice      │    │  Pixel-perfect      │                │
│   │  Complex setup      │    │  Simple workflow    │                │
│   └─────────────────────┘    └─────────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Requirements

### 1. Legal Section Handling
Klaviyo requires certain dynamic fields for compliance:
- `{% unsubscribe_url %}` - Unsubscribe link
- `{% manage_preferences_url %}` - Preferences link
- `{{ organization.address }}` - Physical address
- `{{ organization.name }}` - Company name

These CANNOT be images - they must be HTML with Klaviyo merge tags.

### 2. Detection Strategy
Looking at the example footers provided:

**Example 1 (Eskiin - dark footer):**
- Visual section: Logo + Social Icons
- Legal section: "Eskiin Inc. 9450 Southwest Gemini Drive..." + "UNSUBSCRIBE"

**Example 2 (OneSol - white footer):**
- Visual section: Buttons + Social icons + Disclaimer text
- Legal section: "Manage Preferences | Unsubscribe" + Logo

**Example 3 (Earth Breeze - grey footer):**
- Visual section: Logo + Social + Buttons + Badges
- Legal section: Address + "No longer want..." + "Unsubscribe" + Copyright

The legal section typically contains small text (11-14px) with terms like:
- "Unsubscribe"
- "Manage Preferences"
- Address text (street, city, state, zip)
- Organization/company name
- Copyright

---

## Implementation Architecture

```text
IMAGE FOOTER FLOW:

┌────────────────┐     ┌──────────────────────────┐
│ Footer Image   │ ──► │ auto-slice-footer        │
│   (uploaded)   │     │ (new edge function)      │
└────────────────┘     └──────────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────────┐
                       │ Returns:                 │
                       │ - visualSlices[]         │
                       │   (images with links)    │
                       │ - legalCutoffY           │
                       │   (where legal starts)   │
                       └──────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
                ▼                                   ▼
┌────────────────────────┐          ┌────────────────────────────────┐
│ Visual Section         │          │ Legal Section (HTML)           │
│ - Cropped images       │          │ - Background color matched     │
│ - Links assigned       │          │ - {{ organization.name }}      │
│ - Alt text generated   │          │ - {{ organization.address }}   │
│ - Social icon links    │          │ - {% unsubscribe_url %}        │
└────────────────────────┘          │ - {% manage_preferences_url %} │
                                    └────────────────────────────────┘
                                    
                ┌─────────────────┴─────────────────┐
                │                                   │
                ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ Combined Footer HTML:                                            │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ <img src="slice1.png" alt="Logo" href="/">                  │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ <img src="slice2.png" alt="Shop buttons" href="/shop">     │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ Social icons: <img> <img> <img> (each linked)              │  │
│ ├────────────────────────────────────────────────────────────┤  │
│ │ HTML: {{ organization.name }} | {{ organization.address }} │  │
│ │       <a href="{% unsubscribe_url %}">Unsubscribe</a>      │  │
│ └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation

### Phase 1: Add Footer Type Selection to Modal

**File: `src/components/FooterBuilderModal.tsx`**

Add a new initial step before "reference" that asks users to choose:
- **HTML Footer** (existing flow)
- **Image Footer** (new simplified flow)

```typescript
type FooterType = 'html' | 'image' | null;
type Step = 'type' | 'reference' | 'links' | 'social' | 'generate';

// New state
const [footerType, setFooterType] = useState<FooterType>(null);
```

The UI will show two cards:
1. **HTML Footer**: "More flexible, best practice" - proceeds to existing complex flow
2. **Image Footer**: "Faster setup, pixel-perfect" - proceeds to new simplified flow

### Phase 2: Create New Edge Function for Footer Slicing

**New file: `supabase/functions/auto-slice-footer/index.ts`**

This function will:
1. Accept a footer image
2. Run Google Cloud Vision OCR to detect all text
3. Identify the "legal section" by detecting keywords:
   - "unsubscribe" (case-insensitive)
   - "manage preferences" / "email preferences"
   - Address patterns (city, state, zip)
   - Organization/company name patterns
4. Determine the `legalCutoffY` - the Y position where legal text begins
5. Run slice detection on the visual portion (above the cutoff)
6. Return both the slices and legal section metadata

```typescript
interface FooterSliceResponse {
  success: boolean;
  // Visual slices (above legal cutoff)
  slices: {
    imageUrl: string;  // Cropped image uploaded to Cloudinary
    yTop: number;
    yBottom: number;
    altText: string;
    link: string | null;
    isClickable: boolean;
    // For horizontal splits (nav links, social icons)
    columns?: {
      imageUrl: string;
      link: string;
      altText: string;
    }[];
  }[];
  // Legal section metadata
  legalSection: {
    yStart: number;
    backgroundColor: string;  // Extracted from image
    textColor: string;        // Extracted from image
    detectedElements: {
      type: 'unsubscribe' | 'preferences' | 'address' | 'org_name' | 'copyright';
      text: string;
    }[];
  };
  // Processing metadata
  processingTimeMs: number;
  debug?: {
    totalTextBlocks: number;
    legalTextBlocks: number;
  };
}
```

### Phase 3: Simplified Image Footer Flow

**File: `src/components/FooterBuilderModal.tsx`**

When `footerType === 'image'`:

1. **Step 1: Upload** - User uploads footer image (same UI as current)
2. **Step 2: Review** - Show detected slices with link assignments
   - Display cropped slices in a preview
   - Allow editing links/alt text
   - Show legal section preview with merged tags
3. **Step 3: Save** - Generate final HTML and save

The review step will show:
```text
┌─────────────────────────────────────────────────────────────┐
│ Footer Preview                                               │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [Slice 1: Logo]                     Link: /            │ │
│ │ [Slice 2: Social Icons]  🔗 instagram.com/...         │ │
│ │ [Slice 3: Buttons Row]   🔗 /collections/all          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Legal Section (HTML with Klaviyo tags):                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ {{ organization.name }} | {{ organization.address }}    │ │
│ │ Unsubscribe | Manage Preferences                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Generate Combined Footer HTML

**File: `src/components/FooterBuilderModal.tsx`**

The final HTML structure for image footers:

```html
<!-- FOOTER START -->
<tr>
  <td style="padding: 0; background-color: {detected_bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <!-- Visual slices (images) -->
      <tr>
        <td align="center">
          <a href="{link}"><img src="{slice_url}" alt="{alt}" width="600" style="display: block;"/></a>
        </td>
      </tr>
      <!-- Repeat for each slice... -->
      
      <!-- Legal section (HTML with Klaviyo tags) -->
      <tr>
        <td align="center" style="padding: 20px; font-size: 11px; color: {text_color}; background-color: {bg_color};">
          {{ organization.name }} | {{ organization.address }}<br><br>
          <a href="{% unsubscribe_url %}" style="color: {text_color};">Unsubscribe</a> | 
          <a href="{% manage_preferences_url %}" style="color: {text_color};">Manage Preferences</a>
        </td>
      </tr>
    </table>
  </td>
</tr>
<!-- FOOTER END -->
```

### Phase 5: Update Database Schema

**Migration: Add footer_type column**

```sql
ALTER TABLE brand_footers 
ADD COLUMN footer_type text DEFAULT 'html' CHECK (footer_type IN ('html', 'image'));

-- Store image slice data for image-type footers
ALTER TABLE brand_footers
ADD COLUMN image_slices jsonb;
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/auto-slice-footer/index.ts` | **Create** | New edge function for footer-specific slicing with legal section detection |
| `src/components/FooterBuilderModal.tsx` | **Modify** | Add footer type selection step, add image footer flow |
| `src/types/footer.ts` | **Create** | TypeScript types for image footer data structures |
| `supabase/config.toml` | **Modify** | Register new edge function |
| Database migration | **Create** | Add footer_type and image_slices columns |

---

## Legal Section Detection Logic

The edge function will use these heuristics to identify the legal section:

1. **Keyword matching** (case-insensitive):
   - "unsubscribe"
   - "manage preferences" / "email preferences"
   - "no longer want to receive"
   - Copyright symbols (©, (c))

2. **Address pattern matching**:
   - Regex: `/\d+\s+[\w\s]+,\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/` (US addresses)
   - Contains city + state + zip pattern

3. **Font size detection**:
   - Legal text is typically smaller (10-12px)
   - Vision API provides estimated font sizes

4. **Position heuristic**:
   - Legal content is always at the bottom
   - Look for the highest Y position where legal keywords appear
   - Everything below that Y becomes the legal section

---

## Example Processing

**Input: Eskiin footer image**

1. Vision OCR detects:
   - "eskiin" logo at y=100-200
   - Social icons at y=250-350
   - "Eskiin Inc. 9450 Southwest..." at y=450 (ADDRESS DETECTED)
   - "UNSUBSCRIBE" at y=520 (LEGAL KEYWORD)

2. Legal cutoff determined: y=430 (20px above first legal text)

3. Output:
   - Visual slices: Logo (0-430px), cropped and uploaded
   - Legal section: bg=#2d2d2d, text=#ffffff

4. Final HTML:
   - Image slice with logo/social
   - HTML legal section with {{ organization.address }}, {% unsubscribe_url %}

---

## Benefits of Image-Based Approach

| Aspect | HTML Footer | Image Footer |
|--------|-------------|--------------|
| Setup time | 5-10 min (with refinement) | 1-2 min |
| Accuracy | Requires convergence loop | Pixel-perfect by definition |
| Flexibility | Full editability | Fixed visual, editable links |
| File size | ~5KB HTML | ~50KB images |
| Best for | Custom designs, frequent changes | Established brand footers |

---

## Technical Notes

1. **Slice upload**: Each visual slice will be uploaded to Cloudinary using the existing `upload-to-cloudinary` function

2. **Social icon detection**: The system will detect social icons as small, square elements and attempt to match them to brand social links

3. **Background color extraction**: The legal section's background color will be sampled from the image at the cutoff point to ensure seamless visual continuity

4. **Mobile responsiveness**: Image slices will use `width: 100%` with `max-width: 600px` for email compatibility
