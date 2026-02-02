

# EmailForge Processing Pipeline Implementation Plan

## Executive Summary

This plan implements the EmailForge AI email design training system's processing pipeline. The request describes a system that is remarkably similar to the existing Queue'd/Sendr pipeline already in the codebase, with some key differences focused on **module analysis for training purposes** rather than email production.

## Current State Analysis

The existing codebase already has:
- **`figma-ingest`** - Validates tokens, uploads to Cloudinary, creates queue items, triggers processing
- **`process-campaign-queue`** - Orchestrates the full pipeline with parallel early generation
- **`auto-slice-v2`** - Google Vision + Claude slicing with link intelligence
- **`upload-to-cloudinary`** - Image hosting with server-side transformations
- **`generate-embedding`** - OpenAI text-embedding-3-small for semantic search

The EmailForge request requires:
1. A **`modules` table** to store analyzed slices as standalone training examples
2. **Deep module analysis** with content/visual/layout extraction
3. **Brand statistics** tracking (total_campaigns, total_modules)
4. **Brand profile generation** trigger after 5+ reference-quality modules

## Database Schema Changes

### New Table: `modules`

```sql
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- Position and type
  module_index INTEGER NOT NULL,
  module_type TEXT NOT NULL,
  module_type_confidence FLOAT DEFAULT 0.8,
  
  -- Image data (Cloudinary URLs)
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  y_start INTEGER NOT NULL,
  y_end INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  
  -- AI-extracted content
  content JSONB DEFAULT '{}',           -- headlines, CTAs, bullets, etc.
  visuals JSONB DEFAULT '{}',           -- colors, image type, layout
  layout JSONB DEFAULT '{}',            -- alignment, element order
  composition_notes TEXT,               -- How to recreate this module
  
  -- Quality and training
  quality_score FLOAT DEFAULT 0,
  is_reference_quality BOOLEAN DEFAULT false,
  embedding VECTOR(1536),               -- For similarity search
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable vector similarity search
CREATE INDEX modules_embedding_idx ON modules 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Standard indexes
CREATE INDEX modules_brand_id_idx ON modules(brand_id);
CREATE INDEX modules_campaign_id_idx ON modules(campaign_id);
CREATE INDEX modules_module_type_idx ON modules(module_type);
CREATE INDEX modules_is_reference_quality_idx ON modules(is_reference_quality) WHERE is_reference_quality = true;
```

### Extend `campaigns` Table

```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS
  cloudinary_public_id TEXT,
  vision_data JSONB,
  module_boundaries JSONB,
  campaign_analysis JSONB,
  embedding VECTOR(1536),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  processing_step TEXT,
  processing_percent INTEGER DEFAULT 0,
  raw_image_url TEXT;

-- Add status options: 'pending', 'processing', 'vision_processing', 'slicing', 'analyzing', 'complete', 'failed'
```

### Extend `brands` Table

```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS
  total_modules INTEGER DEFAULT 0,
  total_campaigns INTEGER DEFAULT 0;
```

### New Table: `brand_profiles` (for future use)

```sql
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID UNIQUE NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- AI-generated brand design patterns
  design_patterns JSONB DEFAULT '{}',
  color_palette JSONB DEFAULT '{}',
  typography_patterns JSONB DEFAULT '{}',
  layout_preferences JSONB DEFAULT '{}',
  
  last_analyzed_at TIMESTAMPTZ,
  module_count_at_analysis INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### New Table: `processing_jobs` (for background tasks)

```sql
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Edge Function: `process-campaign`

This will be a NEW edge function specifically for EmailForge, separate from the existing `process-campaign-queue` (which is for email production).

### Pipeline Flow

```text
Campaign (status: pending)
         |
         v
+-------------------------------------+
|  STEP 1: Upload to Cloudinary       |
|  - Upload full campaign image       |
|  - Get public_id for URL transforms |
|  - Calculate scale factors          |
|  status: processing (5-10%)         |
+-------------------------------------+
         |
         v
+-------------------------------------+
|  STEP 2: Google Vision (parallel)   |
|  - DOCUMENT_TEXT_DETECTION (OCR)    |
|  - OBJECT_LOCALIZATION              |  
|  - LOGO_DETECTION                   |
|  status: vision_processing (10-30%) |
+-------------------------------------+
         |
         v
+-------------------------------------+
|  STEP 3: AI Module Slicing          |
|  - Claude receives image + ALL      |
|    vision data with coordinates     |
|  - Returns Y boundaries + types     |
|  status: slicing (30-50%)           |
+-------------------------------------+
         |
         v
+-------------------------------------+
|  STEP 4: Generate Cloudinary URLs   |
|  - Scale coordinates to full size   |
|  - Build crop URL for each module   |
|  - NO actual image processing!      |
|  status: analyzing (50-60%)         |
+-------------------------------------+
         |
         v
+-------------------------------------+
|  STEP 5: Deep Module Analysis       |
|  - Claude analyzes each module      |
|  - Extracts copy, colors, layout    |
|  - Writes composition notes         |
|  status: analyzing (60-95%)         |
+-------------------------------------+
         |
         v
+-------------------------------------+
|  STEP 6: Finalize                   |
|  - Generate campaign embedding      |
|  - Update brand stats               |
|  - Check brand profile trigger      |
|  status: complete (100%)            |
+-------------------------------------+
```

### Key Implementation Details

#### Cloudinary URL Cropping (The Core Optimization)

Instead of downloading and cropping images, we generate transformation URLs:

```typescript
function buildCloudinaryUrl(publicId: string, transforms: Record<string, any>): string {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  
  const transformParts: string[] = [];
  if (transforms.crop) transformParts.push(`c_${transforms.crop}`);
  if (transforms.width) transformParts.push(`w_${transforms.width}`);
  if (transforms.height) transformParts.push(`h_${transforms.height}`);
  if (transforms.x !== undefined) transformParts.push(`x_${transforms.x}`);
  if (transforms.y !== undefined) transformParts.push(`y_${transforms.y}`);
  if (transforms.quality) transformParts.push(`q_${transforms.quality}`);
  if (transforms.format) transformParts.push(`f_${transforms.format}`);
  
  const transformString = transformParts.join(',');
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformString}/${publicId}`;
}

// Usage:
const moduleImageUrl = buildCloudinaryUrl(publicId, {
  crop: 'crop',
  x: 0,
  y: yTopOriginal,  // Scaled coordinate
  width: originalWidth,
  height: heightOriginal,
  quality: 90,
  format: 'jpg'
});
```

#### Scale Factor Calculation

```typescript
function calculateAnalysisDimensions(
  originalWidth: number, 
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { analysisWidth: number; analysisHeight: number; scaleFactor: number } {
  
  const ANALYSIS_MAX_WIDTH = 600;
  const ANALYSIS_MAX_HEIGHT = 7900;
  
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return { analysisWidth: originalWidth, analysisHeight: originalHeight, scaleFactor: 1 };
  }
  
  const widthRatio = maxWidth / originalWidth;
  const heightRatio = maxHeight / originalHeight;
  const ratio = Math.min(widthRatio, heightRatio);
  
  const analysisWidth = Math.round(originalWidth * ratio);
  const analysisHeight = Math.round(originalHeight * ratio);
  const scaleFactor = originalWidth / analysisWidth;
  
  return { analysisWidth, analysisHeight, scaleFactor };
}
```

#### Module Types

| Type | Description |
|------|-------------|
| announcement_bar | Colored strip at top with promo/urgency text |
| logo_header | Brand logo, sometimes with preheader text |
| hero | Big headline + subhead + CTA + hero image |
| product_card | Image + product name + details + CTA |
| benefits_list | Bullet points explaining product value |
| free_gifts_module | Multi-column GWP offers layout |
| value_props_strip | Horizontal list of benefits with icons |
| timeline_journey | Progressive results timeline |
| feature_diagram | Product image with spec callouts |
| educational_block | Problem/solution text-heavy section |
| lifestyle_block | Emotional/aspirational copy section |
| mid_email_cta_banner | Colored strip with secondary CTA |
| footer | Logo + social icons + address + unsubscribe |

### Claude Prompts

#### Module Slicing Prompt (Step 3)

```text
You are analyzing an email design to slice it into DESIGN MODULES for a training database.

## CRITICAL CONTEXT

We are building an AI system that learns brand design patterns. We need to identify 
COMPLETE DESIGN MODULES - not individual clickable elements.

A hero section (logo + headline + CTA + image) = ONE MODULE
Keep cohesive design units together.

## Image Dimensions
${width}px wide x ${height}px tall

## Detected Text Blocks (with Y coordinates in pixels)
${textBlocks}

## Detected Objects
${objectBlocks}

## Detected Logos
${logoBlocks}

---

## MODULE TYPES (use these exact names)

- announcement_bar
- logo_header
- hero
- product_card
- benefits_list
- free_gifts_module
- value_props_strip
- timeline_journey
- feature_diagram
- educational_block
- lifestyle_block
- mid_email_cta_banner
- footer

---

## SLICING RULES (CRITICAL - FOLLOW EXACTLY)

### RULE 1: PADDING FROM CONTENT
- Leave at least 30-50px MINIMUM padding from any text block
- Cut in the CENTER of gaps between sections, not at edges
- If there's a background color change, slice in the MIDDLE of the transition

### RULE 2: KEEP COHESIVE SECTIONS TOGETHER
- Hero = logo + headline + subhead + CTA + image = ONE module
- Product sections include their badges, prices, and buttons

### RULE 3: USE THE VISION DATA
- The text coordinates tell you exactly where content is
- Find gaps where there's NO text for 50+ pixels
- Those gaps are your slice points

### RULE 4: BOUNDARIES
- First module MUST start at y_start: 0
- Last module MUST end at y_end: ${height}
- No gaps between modules
- Minimum module height: 80px

---

## OUTPUT FORMAT

Return ONLY valid JSON, no markdown:

{
  "modules": [
    {
      "y_start": 0,
      "y_end": 60,
      "module_type": "announcement_bar",
      "confidence": 0.95
    }
  ]
}
```

#### Deep Module Analysis Prompt (Step 5)

```text
Analyze this email module in detail for AI training.

## Module Type: ${module.module_type}
## Dimensions: ${module.width}px x ${module.height}px

Extract all information in this JSON structure:

{
  "content": {
    "headline": "EXACT headline text or null",
    "subheadline": "EXACT subheadline or null", 
    "body_copy": "Body text or null",
    "bullet_points": ["point 1", "point 2"],
    "cta_text": "Button text or null",
    "offer_text": "Discount/promo text or null",
    "product_names": ["product 1"],
    "has_logo": true,
    "logo_position": "top_center"
  },
  "visuals": {
    "background_color": "#FFFFFF",
    "background_type": "solid",
    "text_color_primary": "#1A1A1A",
    "text_color_secondary": "#666666",
    "accent_color": "#C8FF00",
    "has_image": true,
    "image_type": "lifestyle or product",
    "image_position": "bottom",
    "image_coverage_percent": 60,
    "cta_style": {
      "shape": "pill or rectangle",
      "fill_color": "#C8FF00",
      "text_color": "#000000"
    }
  },
  "layout": {
    "alignment": "center or left",
    "content_width_percent": 85,
    "element_order": ["logo", "headline", "cta", "image"]
  },
  "composition_notes": "3-5 sentences describing EXACTLY how to recreate this module.",
  "quality_score": 0.9,
  "is_reference_quality": true
}
```

## Frontend Components

### ModuleCard Component

Displays a module thumbnail with type badge and quality indicator.

### ModuleDetailModal Component

Full-screen modal for viewing/editing module details:
- Full-size module image
- Module type selector (dropdown)
- Extracted content display
- Visual analysis (colors, layout)
- Composition notes (AI-generated recreation guide)
- Quality score display

### Modules Tab in Brand Detail

Grid view of all modules for a brand, filterable by type.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/process-campaign/index.ts` | Create | New EmailForge processing pipeline |
| `src/components/modules/ModuleCard.tsx` | Create | Module thumbnail display |
| `src/components/modules/ModuleDetailModal.tsx` | Create | Module detail view/edit |
| `src/hooks/useModules.ts` | Create | Module CRUD operations |
| `src/pages/BrandModules.tsx` | Create | Brand modules grid view |
| Database migration | Create | Add modules, brand_profiles, processing_jobs tables |
| Database migration | Create | Extend campaigns and brands tables |

## Testing Checklist

1. Image uploads to Cloudinary successfully
2. Vision API returns text blocks with Y coordinates
3. Claude receives vision data in the prompt
4. Slice boundaries have proper padding from text
5. Cloudinary crop URLs work (module images show correct sections)
6. Each module shows different content (not same image repeated)
7. Module detail modal opens on click
8. Module type can be changed and saved
9. Deep analysis extracts headlines, CTAs, etc.
10. Brand stats update after processing

## Technical Notes

### Environment Variables Required

All are already configured in the project:
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLOUD_VISION_API_KEY`
- `OPENAI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Model Selection

Following the existing pattern in the codebase:
- **claude-sonnet-4-20250514** for module slicing (spatial reasoning)
- **claude-sonnet-4-20250514** for deep module analysis
- **text-embedding-3-small** for embeddings

### Reusing Existing Code

The implementation will leverage existing utilities:
- `upload-to-cloudinary` edge function (already exists)
- `generate-embedding` edge function (already exists)
- Google Vision API patterns from `auto-slice-v2`
- Cloudinary URL transformation patterns from `process-campaign-queue`

