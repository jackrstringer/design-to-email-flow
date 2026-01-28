

# Technical Architecture Documentation

## Document Overview

I'll create a single comprehensive markdown file (`TECHNICAL_ARCHITECTURE.md`) that documents the complete email campaign processing pipeline from Figma export to Klaviyo-ready HTML.

---

## File to Create

**`TECHNICAL_ARCHITECTURE.md`** (at project root)

---

## Document Structure

### 1. System Overview
- High-level architecture diagram (Mermaid)
- Technology stack summary
- Key components: Figma Plugin → Edge Functions → Supabase → External APIs

### 2. User Flow: Figma Plugin Export

**Plugin Export Payload:**
```typescript
interface IngestPayload {
  pluginToken: string;           // Auth token from plugin_tokens table
  frames: [{
    name: string;                // Frame name → becomes campaign name
    width: number;               // Original frame width (px)
    height: number;              // Original frame height (px)
    imageBase64: string;         // PNG base64 (1x or 2x based on size)
    figmaUrl?: string;           // Link to Figma for ClickUp integration
  }];
  subjectLine?: string;          // Optional provided subject line
  previewText?: string;          // Optional provided preview text
  brandId?: string;              // Optional pre-selected brand
}
```

**Export Scaling Logic:**
- Frames over 3500px height → 1x export scale
- Smaller frames → 2x export (retina)

### 3. Backend Processing Pipeline (8 Steps)

| Step | Function | AI Model | Est. Time | Dependencies |
|------|----------|----------|-----------|--------------|
| 1 | `figma-ingest` → `upload-to-cloudinary` | None | ~2s | None |
| 1.5 (parallel) | `generate-email-copy-early` | **Claude Sonnet 4** | ~8-12s | Runs async, doesn't block |
| 1.5b (parallel) | `search-clickup-for-copy` | **Gemini 2.5 Flash Lite** | ~2s | Optional, needs ClickUp config |
| 2 (parallel) | `detect-brand-from-image` | **Claude Sonnet 4** + web_search | ~5-8s | Step 1 complete |
| 3 (parallel) | `auto-slice-v2` | **Google Vision API** + **Claude Sonnet 4.5** | ~20-30s | Step 1 complete |
| 3.5 | `cropAndUploadSlices` | None (ImageScript) | ~15-25s | Step 3 complete |
| 4 | `analyze-slices` | **Claude Sonnet 4.5** + web_search + web_fetch | ~30-45s | Step 3.5 complete |
| 5 | Poll `early_generated_copy` | None | ~0-12s | Wait for Step 1.5 |
| 6 | `qa-spelling-check` | **Claude Sonnet 4** | ~3-5s | Step 1 complete |
| 7 | Merge & finalize | None | ~1s | All steps complete |
| **TOTAL** | | | **~90-120s** | |

### 4. Detailed Step Documentation

For each step, document:
- **Function name** and file location
- **Input**: What data it receives
- **Output**: What it returns
- **AI Model**: Exact model used and why
- **Cloudinary transformations**: URL patterns used
- **Database operations**: Tables read/written
- **External API calls**: Third-party services invoked

#### Step 1: Image Upload (`figma-ingest`)
- **Input**: Base64 image from Figma plugin
- **Output**: Cloudinary URL, campaign_queue entry created
- **Cloudinary**: Direct upload to `campaign-queue` folder
- **DB Write**: `campaign_queue` (insert new entry)
- **DB Read**: `plugin_tokens` (validate token), `brands` (validate brandId if provided)

#### Step 1.5: Early Copy Generation (`generate-email-copy-early`)
- **AI Model**: `claude-sonnet-4-20250514`
- **Input**: Resized campaign image (600x7900 max), brand context
- **Output**: 10 subject lines, 10 preview texts, spelling errors
- **Cloudinary**: `c_limit,w_600,h_7900` transformation
- **DB Write**: `early_generated_copy` (upsert)

#### Step 1.5b: ClickUp Copy Search (`search-clickup-for-copy`)
- **AI Model**: `google/gemini-2.5-flash-lite` (via Lovable AI Gateway)
- **Input**: Figma URL, ClickUp API key, list ID
- **Output**: Subject line, preview text from matched task
- **External API**: ClickUp API v2/v3

#### Step 2: Brand Detection (`detect-brand-from-image`)
- **AI Model**: `claude-sonnet-4-20250514` with `web_search_20250305` tool
- **Input**: Campaign image base64, existing brands list
- **Output**: Matched brand ID or new brand info
- **DB Read**: `brands` (all user brands for matching)

#### Step 3: Auto-Slice (`auto-slice-v2`)
- **AI Models**: 
  - **Google Cloud Vision API** (3 calls in parallel):
    - `DOCUMENT_TEXT_DETECTION` (OCR)
    - `OBJECT_LOCALIZATION` (product detection)
    - `LOGO_DETECTION`
  - **Claude Sonnet 4.5** (`claude-sonnet-4-5`) for decision-making
- **Input**: Campaign image base64
- **Output**: Slice boundaries (yTop, yBottom), footer detection, horizontal split info
- **Cloudinary**: Image resized to max 7900px before Claude API
- **Key Logic**: 
  - Vision APIs gather raw data (coordinates, text, objects)
  - Claude makes ALL slicing decisions using the raw data + visual analysis
  - Horizontal splits detected for side-by-side products/CTAs

#### Step 3.5: Crop & Upload Slices (`cropAndUploadSlices`)
- **AI Model**: None
- **Libraries**: ImageScript (Deno)
- **Input**: Full image base64, slice boundaries
- **Output**: Individual slice images uploaded to Cloudinary
- **Cloudinary**: Each slice uploaded as JPEG (90% quality)
- **Key Logic**: Parallel uploads for speed

#### Step 4: Analyze Slices (`analyze-slices`)
- **AI Model**: `claude-sonnet-4-5` with tools:
  - `web_search_20250305` (find product URLs)
  - `web_fetch_20250910` (crawl collection pages for product URLs)
- **Input**: Slice images, full campaign image (context), brand domain, known product URLs
- **Output**: Alt text, suggested links, clickability flags, link verification status
- **DB Read**: `brands.all_links` (known product URLs - learning system)
- **DB Write**: `brands.all_links` (save discovered URLs)
- **Key Logic**: 
  - Brand Learning System: checks known URLs first
  - Web search + fetch for new products
  - Evergreen URL preference (reject promo URLs)

#### Step 5: Poll for Early Copy
- **AI Model**: None
- **Input**: Session key
- **Output**: Subject lines, preview texts
- **DB Read**: `early_generated_copy` (poll with 2s intervals, max 12s)
- **Fallback**: If timeout, call `generate-email-copy` synchronously

#### Step 6: QA Spelling Check (`qa-spelling-check`)
- **AI Model**: `claude-sonnet-4-20250514`
- **Input**: Campaign image base64
- **Output**: Spelling errors array
- **Key Logic**: Conservative flagging (only obvious typos)

#### Step 7: Merge & Finalize
- **AI Model**: None
- **Input**: All gathered data
- **Output**: Final campaign_queue entry
- **DB Write**: `campaign_queue` (status → 'ready_for_review')
- **Copy Priority**: ClickUp > Figma provided > AI generated

### 5. Klaviyo Publishing (`push-to-klaviyo`)

**Triggered**: User clicks "Build in Klaviyo" after review

**Process**:
1. Fetch brand's Klaviyo API key
2. Build hybrid HTML template with:
   - `USER_DRAGGABLE` editor type
   - `data-klaviyo-region` for editable blocks
   - Multi-column support via nested tables
   - Footer as separate editable region
3. Create Klaviyo template via API
4. If mode='campaign': Create campaign with segments, assign template

**AI Model**: None (template generation is deterministic)
**External API**: Klaviyo API (revision 2025-01-15 for templates, 2025-10-15 for campaigns)

### 6. AI Model Selection Strategy

| Task | Model | Reasoning |
|------|-------|-----------|
| Auto-slicing decisions | Claude Sonnet 4.5 | Complex spatial reasoning, multi-CTA detection, horizontal splits |
| Brand detection | Claude Sonnet 4 | Web search for brand identification |
| Alt text + links | Claude Sonnet 4.5 | Web search + fetch for URL verification |
| Copy generation | Claude Sonnet 4 | Creative writing, brand voice matching |
| Spelling check | Claude Sonnet 4 | Simple proofreading task |
| ClickUp extraction | Gemini 2.5 Flash Lite | Fast, simple extraction task |
| Footer generation | Claude Opus 4 | Complex HTML generation (separate flow) |

### 7. Cloudinary Transformation Reference

| Purpose | Transformation | Example |
|---------|---------------|---------|
| Pipeline processing | `c_limit,w_600,h_4000` | Memory-safe fetching |
| Claude API | `c_limit,w_600,h_7900` | Under 8000px limit |
| Slice cropping | `c_crop,x_{},y_{},w_{},h_{}` | Server-side crop |
| Display preview | `c_limit,w_600` | Consistent width |

### 8. Database Operations Map

```text
Step 1: READ plugin_tokens, brands → WRITE campaign_queue
Step 1.5: WRITE early_generated_copy
Step 2: READ brands → WRITE campaign_queue (brand_id)
Step 3: WRITE campaign_queue (slices, footer_start_percent)
Step 3.5: UPDATE campaign_queue (slice image URLs)
Step 4: READ brands.all_links → WRITE brands.all_links, campaign_queue
Step 5: READ early_generated_copy
Step 6: UPDATE campaign_queue (spelling_errors, qa_flags)
Step 7: UPDATE campaign_queue (final state, status='ready_for_review')
Klaviyo: READ brands, campaign_queue → UPDATE campaign_queue (template_id, campaign_id)
```

### 9. Mermaid Sequence Diagram

```text
sequenceDiagram
    participant Plugin as Figma Plugin
    participant Ingest as figma-ingest
    participant Queue as process-campaign-queue
    participant Cloud as Cloudinary
    participant Vision as Google Vision API
    participant Claude as Claude API (Anthropic)
    participant ClickUp as ClickUp API
    participant DB as Supabase DB
    participant Klaviyo as Klaviyo API

    Note over Plugin,Ingest: USER EXPORTS FROM FIGMA
    Plugin->>Ingest: POST frames + metadata
    Ingest->>DB: Validate plugin_token
    Ingest->>Cloud: Upload full image
    Cloud-->>Ingest: secure_url
    Ingest->>DB: INSERT campaign_queue
    Ingest-->>Queue: Fire async processing
    
    Note over Queue: STEP 1: FETCH IMAGE
    Queue->>Cloud: GET resized image (600x4000)
    Cloud-->>Queue: base64 image
    
    Note over Queue: STEP 1.5: PARALLEL ASYNC TASKS
    par Early Copy Generation
        Queue-->>Claude: generate-email-copy-early
        Claude-->>DB: Store in early_generated_copy
    and ClickUp Search (if configured)
        Queue->>ClickUp: Search for Figma URL
        ClickUp-->>Queue: SL/PT from task
    end
    
    Note over Queue: STEPS 2+3: PARALLEL AI
    par Brand Detection
        Queue->>Claude: detect-brand-from-image + web_search
        Claude-->>Queue: Brand ID or new brand
    and Auto-Slice
        Queue->>Vision: OCR + Objects + Logos (3 parallel calls)
        Vision-->>Queue: Raw coordinates
        Queue->>Claude: auto-slice-v2 decision
        Claude-->>Queue: Slice boundaries + footer
    end
    Queue->>DB: UPDATE brand_id, slices
    
    Note over Queue: STEP 3.5: CROP & UPLOAD
    loop For each slice
        Queue->>Cloud: Upload cropped slice
    end
    
    Note over Queue: STEP 4: ANALYZE SLICES
    Queue->>DB: READ brands.all_links (known URLs)
    Queue->>Claude: analyze-slices + web_search + web_fetch
    Claude-->>Queue: Alt text, links, clickability
    Queue->>DB: WRITE brands.all_links (learned URLs)
    
    Note over Queue: STEP 5: POLL EARLY COPY
    loop Poll (max 12s)
        Queue->>DB: Check early_generated_copy
    end
    
    Note over Queue: STEP 6: QA CHECK
    Queue->>Claude: qa-spelling-check
    Claude-->>Queue: Spelling errors
    
    Note over Queue: STEP 7: FINALIZE
    Queue->>DB: UPDATE campaign_queue (ready_for_review)
    
    Note over Klaviyo: USER CLICKS "BUILD IN KLAVIYO"
    Queue->>Klaviyo: Create template (USER_DRAGGABLE)
    Klaviyo-->>Queue: template_id
    Queue->>Klaviyo: Create campaign + assign template
    Klaviyo-->>Queue: campaign_id, campaign_url
    Queue->>DB: UPDATE klaviyo IDs
```

### 10. Parallelization Analysis

| Current Parallel | Could Be Parallel | Notes |
|-----------------|-------------------|-------|
| Early copy (Step 1.5) | ✅ Already async | Fire and forget |
| ClickUp search (Step 1.5b) | ✅ Already async | Only if configured |
| Brand + Slice (Steps 2+3) | ✅ Already parallel | Promise.all |
| Slice uploads (Step 3.5) | ✅ Already parallel | Promise.all |
| Slice analysis (Step 4) | ❌ Could run with Step 6 | QA could start early |
| QA check (Step 6) | ❌ Runs late | Could start after Step 1 |
| Spelling (from early copy) | ✅ Merged at end | Runs with copy gen |

### 11. External API Reference

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| Anthropic | Claude models | `x-api-key` header |
| Google Cloud Vision | OCR, object/logo detection | API key in URL |
| Cloudinary | Image storage/transforms | Signed uploads |
| Klaviyo | Template/campaign creation | `Klaviyo-API-Key` header |
| ClickUp | Copy retrieval | `Authorization` header |
| Lovable AI Gateway | Gemini models | `Authorization: Bearer` |

---

## Implementation

I will write the complete `TECHNICAL_ARCHITECTURE.md` file with all sections above, including:
- Proper markdown formatting
- The complete Mermaid sequence diagram
- All tables and code examples
- Cross-references between sections
