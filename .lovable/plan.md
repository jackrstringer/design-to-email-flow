

# Image-Based Footer Route - Full Pipeline Integration

## Overview

The current `auto-slice-footer` edge function only does basic OCR to find legal keywords but does **not** actually slice the image, assign links, or generate alt text like the campaign queue pipeline does. The user is correct - the footer needs to go through the **same processing pipeline** as queued campaigns:

1. Upload image (or fetch from Figma link)
2. Auto-slice with link intelligence (`auto-slice-v2`)
3. Generate Cloudinary crop URLs
4. Detect and extract legal section
5. Generate combined HTML with image slices + legal HTML block
6. **Present finished build to user for link/alt-text approval**
7. Save to `brand_footers` on approval

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         INPUT OPTIONS                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │  Upload Image    │    │   Figma Link     │                       │
│  │  (drag & drop)   │    │   (paste URL)    │                       │
│  └────────┬─────────┘    └────────┬─────────┘                       │
│           │                       │                                  │
│           └───────────┬───────────┘                                  │
│                       ▼                                              │
│             ┌─────────────────┐                                      │
│             │ Upload to       │                                      │
│             │ Cloudinary      │                                      │
│             └────────┬────────┘                                      │
│                      ▼                                               │
│      ┌───────────────────────────────────┐                           │
│      │ Create footer_processing_jobs     │                           │
│      │ row with status='processing'      │                           │
│      └───────────────┬───────────────────┘                           │
│                      ▼                                               │
│      ┌───────────────────────────────────┐                           │
│      │ process-footer-queue              │  ← NEW EDGE FUNCTION      │
│      │ (mirrors process-campaign-queue)  │                           │
│      └───────────────┬───────────────────┘                           │
│                      │                                               │
│        ┌─────────────┴─────────────┐                                 │
│        ▼                           ▼                                 │
│ ┌──────────────────┐   ┌────────────────────────┐                    │
│ │ auto-slice-v2    │   │ Legal section detect   │                    │
│ │ (with link       │   │ + extract colors       │                    │
│ │  intelligence)   │   └───────────┬────────────┘                    │
│ └────────┬─────────┘               │                                 │
│          │                         │                                 │
│          └─────────────┬───────────┘                                 │
│                        ▼                                             │
│      ┌─────────────────────────────────────┐                         │
│      │ Generate Cloudinary crop URLs       │                         │
│      │ (instant, no upload needed)         │                         │
│      └───────────────┬─────────────────────┘                         │
│                      ▼                                               │
│      ┌─────────────────────────────────────┐                         │
│      │ Update job: status='pending_review' │                         │
│      │ Store: slices, legal section data   │                         │
│      └───────────────┬─────────────────────┘                         │
│                      ▼                                               │
│      ┌─────────────────────────────────────┐                         │
│      │ UI: Show finished preview           │                         │
│      │ with editable links + alt text      │                         │
│      └───────────────┬─────────────────────┘                         │
│                      ▼                                               │
│      ┌─────────────────────────────────────┐                         │
│      │ User clicks "Save Footer"           │                         │
│      │ → Generate final HTML               │                         │
│      │ → Insert into brand_footers         │                         │
│      └─────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema - Footer Processing Jobs Table

Create a dedicated `footer_processing_jobs` table to track processing state (separate from campaign queue per user preference):

```sql
CREATE TABLE public.footer_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  
  -- Source info
  source TEXT NOT NULL CHECK (source IN ('upload', 'figma')),
  source_url TEXT,  -- Figma URL if applicable
  
  -- Input image
  image_url TEXT NOT NULL,
  cloudinary_public_id TEXT,
  image_width INT,
  image_height INT,
  
  -- Processing results
  slices JSONB,  -- Array of processed slices with links/alt text
  legal_section JSONB,  -- { yStart, backgroundColor, textColor, detectedElements }
  footer_start_y INT,  -- Where footer slices end (legal section starts)
  
  -- Status tracking
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'pending_review', 'completed', 'failed')),
  processing_step TEXT,
  processing_percent INT DEFAULT 0,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processing_completed_at TIMESTAMPTZ
);

-- RLS policies
ALTER TABLE public.footer_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own footer jobs" 
  ON public.footer_processing_jobs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own footer jobs" 
  ON public.footer_processing_jobs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own footer jobs" 
  ON public.footer_processing_jobs FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own footer jobs" 
  ON public.footer_processing_jobs FOR DELETE 
  USING (auth.uid() = user_id);

-- Enable realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.footer_processing_jobs;

-- Updated_at trigger
CREATE TRIGGER update_footer_processing_jobs_updated_at
  BEFORE UPDATE ON footer_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Phase 2: New Edge Function - `process-footer-queue`

Create `supabase/functions/process-footer-queue/index.ts` that mirrors `process-campaign-queue` but specialized for footers:

### Processing Steps

| Step | % | Description |
|------|---|-------------|
| 1 | 0-10 | Fetch image, validate dimensions |
| 2 | 10-40 | Run `auto-slice-v2` with brand's link index |
| 3 | 40-50 | Detect legal section boundary |
| 4 | 50-70 | Generate Cloudinary crop URLs for visual slices |
| 5 | 70-90 | Filter slices above legal boundary |
| 6 | 90-100 | Update job with results, set status='pending_review' |

### Key Differences from Campaign Processing

| Aspect | Campaign Queue | Footer Processing |
|--------|----------------|-------------------|
| Footer detection | Exclude footer from slices | Legal section becomes HTML replacement |
| Copy generation | Generate subject lines + preview text | Not applicable |
| QA spelling check | Yes | Not applicable |
| Output | Slices for Klaviyo template | Complete footer (slices + legal HTML) |
| Final action | Push to Klaviyo | Save to brand_footers |

### Legal Section Detection Logic

```typescript
// In process-footer-queue

// Run Vision OCR to find legal keywords
const legalKeywords = [
  'unsubscribe', 'manage preferences', 'email preferences',
  'opt out', 'opt-out', 'no longer want to receive'
];
const addressPatterns = [
  /\d+\s+[\w\s]+,\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/i,
  /P\.?O\.?\s*Box\s+\d+/i,
];

// Find the FIRST occurrence of legal text (lowest Y position)
// Everything below that becomes the legal section (replaced with HTML)
// Everything above gets sliced as images
```

---

## Phase 3: Update FooterBuilderModal - Figma Support + Processing Flow

### Add Figma Input Option

The modal already has `figmaUrl` state and `handleFetchFigma()` - reuse this for the image footer route:

```typescript
// In FooterBuilderModal.tsx - Image footer upload step

// State for image footer source
const [imageFooterSource, setImageFooterSource] = useState<'upload' | 'figma' | null>(null);
const [imageFooterFigmaUrl, setImageFooterFigmaUrl] = useState('');

// When source is 'figma':
// 1. Call fetch-figma-design to get exportedImageUrl
// 2. Use that URL as the input image (same as upload path)
```

### Create Footer Processing Job Instead of Inline Processing

```typescript
// Instead of calling auto-slice-footer directly:
const handleStartImageFooterProcessing = async (imageUrl: string) => {
  // 1. Create job in footer_processing_jobs
  const { data: job, error } = await supabase
    .from('footer_processing_jobs')
    .insert({
      user_id: userId,
      brand_id: brand.id,
      source: imageFooterSource === 'figma' ? 'figma' : 'upload',
      source_url: imageFooterSource === 'figma' ? imageFooterFigmaUrl : null,
      image_url: imageUrl,
      image_width: dimensions.width,
      image_height: dimensions.height,
      status: 'processing',
      processing_step: 'queued',
      processing_percent: 0,
    })
    .select()
    .single();

  // 2. Subscribe to realtime updates for this job
  subscribeToJobUpdates(job.id);

  // 3. Trigger processing edge function
  supabase.functions.invoke('process-footer-queue', {
    body: { jobId: job.id }
  });
};
```

### Live Progress UI

```typescript
// Subscribe to realtime updates
const subscribeToJobUpdates = (jobId: string) => {
  const channel = supabase
    .channel(`footer-job-${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'footer_processing_jobs', filter: `id=eq.${jobId}` },
      (payload) => {
        const job = payload.new;
        setProcessingStep(job.processing_step);
        setProcessingPercent(job.processing_percent);
        
        if (job.status === 'pending_review') {
          // Processing complete - show review UI
          setImageFooterSlices(job.slices);
          setImageFooterLegalSection(job.legal_section);
          setStep('review');
        } else if (job.status === 'failed') {
          toast.error(job.error_message || 'Processing failed');
        }
      }
    )
    .subscribe();
};
```

---

## Phase 4: Approval UI - Review Links + Alt Text

When `step === 'review'`:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Footer Preview                                           [Save]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [Slice Preview Image 1]                                      │   │
│  │                                                              │   │
│  │ Alt Text: [editable input______________________________]     │   │
│  │ Link:     [editable input______________________________] ✓   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [Slice Preview Image 2 - Social Icons Row]                   │   │
│  │                                                              │   │
│  │ Column 1: Instagram  [https://instagram.com/brand__]        │   │
│  │ Column 2: Facebook   [https://facebook.com/brand___]        │   │
│  │ Column 3: TikTok     [https://tiktok.com/@brand____]        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Legal Section (HTML)                                         │   │
│  │ ─────────────────────────────────────────────────────────── │   │
│  │ Background: #1a1a1a  Text: #ffffff                          │   │
│  │                                                              │   │
│  │ Preview:                                                     │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ {{ organization.name }} | {{ organization.address }}   │ │   │
│  │ │ Unsubscribe | Manage Preferences                        │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Slice Edit Component

```typescript
interface SliceEditRowProps {
  slice: ProcessedFooterSlice;
  onAltTextChange: (altText: string) => void;
  onLinkChange: (link: string) => void;
  brandLinks: BrandLinkIndexEntry[];  // For autocomplete suggestions
}
```

---

## Phase 5: Generate Final Footer HTML

When user clicks "Save Footer":

```typescript
const handleSaveImageFooter = async () => {
  // Generate HTML combining slices + legal section
  const footerHtml = generateImageFooterHtml(
    approvedSlices,
    legalSection,
    footerWidth
  );

  // Save to brand_footers
  await supabase.from('brand_footers').insert({
    brand_id: brand.id,
    name: footerName,
    html: footerHtml,
    footer_type: 'image',
    image_slices: {
      slices: approvedSlices,
      legalSection,
      originalImageUrl: imageUrl,
      jobId: processingJobId,
    },
    is_primary: isFirstFooter,
  });

  // Update job status
  await supabase
    .from('footer_processing_jobs')
    .update({ status: 'completed' })
    .eq('id', processingJobId);
};
```

### HTML Output Structure

```html
<!-- FOOTER START -->
<tr>
  <td style="padding: 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      
      <!-- Visual Slice 1: Logo -->
      <tr>
        <td align="center">
          <a href="https://brand.com">
            <img src="[cloudinary-crop-url-1]" width="600" alt="Brand logo" 
                 style="display: block; width: 100%; height: auto; border: 0;" />
          </a>
        </td>
      </tr>
      
      <!-- Visual Slice 2: Social Icons (3 columns) -->
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="33.33%" align="center">
                <a href="https://instagram.com/brand">
                  <img src="[cloudinary-crop-url-2a]" width="200" alt="Instagram" />
                </a>
              </td>
              <td width="33.33%" align="center">
                <a href="https://facebook.com/brand">
                  <img src="[cloudinary-crop-url-2b]" width="200" alt="Facebook" />
                </a>
              </td>
              <td width="33.33%" align="center">
                <a href="https://tiktok.com/@brand">
                  <img src="[cloudinary-crop-url-2c]" width="200" alt="TikTok" />
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Legal Section (HTML with Klaviyo merge tags) -->
      <tr>
        <td align="center" style="padding: 24px 20px; background-color: #1a1a1a;">
          <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #ffffff; font-family: Arial, sans-serif;">
            {{ organization.name }} | {{ organization.address }}
          </p>
          <p style="margin: 12px 0 0; font-size: 11px; color: #ffffff; font-family: Arial, sans-serif;">
            <a href="{% unsubscribe_url %}" style="color: #ffffff; text-decoration: underline;">Unsubscribe</a>
            &nbsp;|&nbsp;
            <a href="{% manage_preferences_url %}" style="color: #ffffff; text-decoration: underline;">Manage Preferences</a>
          </p>
        </td>
      </tr>
      
    </table>
  </td>
</tr>
<!-- FOOTER END -->
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/[timestamp].sql` | **Create** | Add `footer_processing_jobs` table with RLS + realtime |
| `supabase/functions/process-footer-queue/index.ts` | **Create** | Main processing function (mirrors campaign queue) |
| `supabase/config.toml` | **Modify** | Register `process-footer-queue` function |
| `src/components/FooterBuilderModal.tsx` | **Modify** | Add Figma input option, realtime job tracking, review UI |
| `src/types/footer.ts` | **Modify** | Update types for processed slices with links/alt text |
| `src/hooks/useFooterProcessingJob.ts` | **Create** | Hook for realtime job status subscription |
| `supabase/functions/auto-slice-footer/index.ts` | **Delete or Deprecate** | Replace with `process-footer-queue` |

---

## Technical Notes

1. **Link Intelligence**: The footer processor will fetch the brand's `brand_link_index` (same as campaign queue) and pass it to `auto-slice-v2` for automatic link matching.

2. **Cloudinary Crop URLs**: Use the same URL transformation approach as campaigns - no image uploads needed during processing.

3. **Legal Section Cutoff**: The processor will:
   - Run `auto-slice-v2` on the ENTIRE footer image
   - Separately run OCR to find legal keywords
   - Filter slices to only include those with `yBottom <= legalCutoffY`
   - Store the legal section metadata (colors, detected elements)

4. **Multi-Column Support**: Social icon rows detected via `horizontalSplit` will be rendered as separate columns with individual links (same as campaign processing).

5. **Realtime Updates**: The `footer_processing_jobs` table has realtime enabled, so the UI can show live progress without polling.

---

## Expected Processing Time

Based on the campaign queue pipeline benchmarks:

| Step | Time |
|------|------|
| Image fetch + validate | ~1s |
| auto-slice-v2 (with link index) | ~8-12s |
| Legal section detection (Vision OCR) | ~2s |
| Generate crop URLs | <1s |
| Total | ~12-16s |

This is significantly faster than the HTML generation route (which took 5+ minutes with refinement loops).

