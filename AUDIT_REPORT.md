---

## COMPREHENSIVE AUDIT REPORT: Design-to-Email-Flow

**Project:** AI-powered email campaign builder (Lovable + React + Supabase + Claude)  
**Deployment:** Lovable Cloud (managed Supabase)  
**Source:** `/Users/jackstringer/design-to-email-flow`

---

## 1. FRONTEND STRUCTURE & ROUTES

### Directory Layout
```
src/
├── pages/                      # Route handlers (18 files)
├── components/                 # 50+ UI components
├── contexts/AuthContext.tsx    # Supabase auth provider
├── hooks/                      # TanStack Query hooks
├── integrations/supabase/      # Auto-generated client + types
├── lib/                        # Utilities (footerVisionDiff.ts, imageSlicing.ts, etc)
├── types/                      # Domain types (slice.ts, footer.ts, brand-assets.ts, etc)
```

### Primary Routes
| Route | Component | Purpose |
|-------|-----------|---------|
| `/auth` | Auth.tsx | Email/password sign-in |
| `/` (default) | Index.tsx → `/queue` | Campaign queue UI |
| `/queue` | CampaignQueue.tsx (18.7KB) | Main workspace—shows pending/review/sent campaigns |
| `/upload` | SimpleUpload.tsx (22.9KB) | Manual single-campaign upload (alternative to plugin) |
| `/campaign/:id` | CampaignPage.tsx (13.5KB) | Campaign detail view + status |
| `/campaign/:id/send` | CampaignSend.tsx (50.3KB) | Review + segment selection + push to Klaviyo |
| `/brands` | Brands.tsx (2.4KB) | Brand list |
| `/brands/:id/{overview,links,email,integrations}` | Brand*tsx files | Brand detail pages |
| `/segments` | Segments.tsx (5.5KB) | Klaviyo segment preset manager |
| `/footer-editor/:brandId` | FooterEditor.tsx (7.2KB) | HTML-based footer editor |
| `/footer-studio/:brandId/:jobId` | ImageFooterStudio.tsx (27KB) | Image-based footer builder with vision-diff loop |
| `/settings` | Settings.tsx (7.7KB) | App-level settings |
| `/dashboard` | Dashboard.tsx (10.3KB) | Brand/campaign creation |

### Frontend State Management
- **Auth:** Supabase Auth (session stored in localStorage via @supabase/supabase-js)
- **Query State:** TanStack Query v5 (useQuery, useMutation)
- **Form State:** React Hook Form + Zod validation
- **UI State:** shadcn/ui + Tailwind (component library)
- **Realtime:** Supabase Realtime subscriptions on `campaign_queue` + `processing_jobs` tables

### Key Frontend Hooks (in src/hooks/)
Likely include: `useCampaignQueue`, `useBrands`, `useSegmentPresets`, `useFooterProcessingJob`, etc.

### How Frontend Talks to Backend
1. **Supabase JS Client:** Direct table reads/writes + RLS enforcement
2. **Edge Functions:** Fetch calls to `SUPABASE_URL/functions/v1/{function-name}` with `Authorization: Bearer token` header
3. **Service Role Key:** Used in edge functions for cross-user writes (campaigns, queue updates)

---

## 2. DATABASE SCHEMA (POSTGRES)

**Source:** `src/integrations/supabase/types.ts` (auto-generated, do NOT edit directly)  
**Actual schema:** `supabase/migrations/` (timestamped SQL files)

### Core Tables

#### **profiles** (auth.users mirror)
```typescript
{
  id: string (PK, auth.uid)
  email: string | null
  clickup_api_key: string | null                 // Optional per-user ClickUp integration
  clickup_workspace_id: string | null
  figma_access_token: string | null
  queue_column_widths: Json | null               // UI state
  queue_zoom_level: number | null                // UI state
  created_at: string
  updated_at: string
}
```
**RLS:** Protected—users can only see/edit their own profile.

#### **brands** (core entity)
```typescript
{
  id: string (PK, UUID)
  user_id: string | null                         // FK to auth.users
  name: string
  domain: string                                 // Brand website domain
  website_url: string | null
  
  // Colors + branding
  primary_color: string
  secondary_color: string
  accent_color: string | null
  background_color: string | null
  text_primary_color: string | null
  
  // Logos (multiple variants for footer)
  light_logo_url: string | null                  // For dark backgrounds
  light_logo_public_id: string | null
  dark_logo_url: string | null                   // For light backgrounds
  dark_logo_public_id: string | null
  footer_logo_url: string | null
  footer_logo_public_id: string | null
  
  // Klaviyo integration
  klaviyo_api_key: string | null                 // PLAINTEXT SECRET - SECURITY RISK
  
  // ClickUp integration (for copy search)
  clickup_api_key: string | null                 // PLAINTEXT SECRET - SECURITY RISK
  clickup_workspace_id: string | null
  clickup_list_id: string | null
  
  // Link intelligence
  all_links: Json                                // { [productName]: url } learned URLs
  link_preferences: Json | null                  // { default_destination_url, rules[] }
  
  // Footer
  footer_html: string | null                     // Cached footer HTML
  footer_configured: boolean | null
  
  // Brand profile (from Firecrawl analysis)
  copy_examples: Json | null
  typography: Json | null
  social_links: Json                             // { twitter, instagram, etc }
  social_icons: Json | null
  html_formatting_rules: Json | null
  
  // Analytics
  total_campaigns: number | null
  total_modules: number | null
  last_crawled_at: string | null
  
  created_at: string
  updated_at: string
}
```
**RLS:** Each user can only access brands where `user_id = auth.uid()`.  
**Security Issue:** Klaviyo + ClickUp API keys stored in plaintext. Should be encrypted at rest.

#### **brand_profiles** (1-to-1 with brands)
```typescript
{
  id: string
  brand_id: string (FK)
  color_palette: Json | null                     // { primary, secondary, accent colors }
  typography_patterns: Json | null
  design_patterns: Json | null
  layout_preferences: Json | null
  module_count_at_analysis: number | null
  last_analyzed_at: string | null
  created_at: string | null
  updated_at: string | null
}
```

#### **brand_link_index** (pgvector RAG table)
```typescript
{
  id: string (PK)
  brand_id: string (FK)
  url: string                                    // The actual link
  title: string | null                          // e.g., "New Arrivals"
  description: string | null                    // SEO snippet
  link_type: string                              // 'product', 'collection', 'page', 'social'
  source: string                                 // 'figma', 'crawl', 'sitemap', 'manual'
  
  embedding: string | null                       // pgvector embedding (openai text-embedding-3-small)
  
  parent_collection_url: string | null           // If a product, its collection
  use_count: number | null                       // Tracking which URLs get used most
  last_used_at: string | null
  last_verified_at: string | null
  is_healthy: boolean | null                     // HTTP 200 last check
  verification_failures: number | null
  user_confirmed: boolean | null                 // Manual user override
  
  created_at: string | null
  updated_at: string | null
}
```
**Index:** pgvector on `embedding` for RAG queries.  
**DB Function:** `match_brand_links(query_embedding, brand_id, count)` — cosine similarity.

#### **campaign_queue** (main processing pipeline)
```typescript
{
  id: string (PK)
  user_id: string (FK, no cascade - historical data)
  brand_id: string | null (FK)
  source: string                                 // 'figma_plugin', 'manual_upload'
  source_url: string | null                      // Figma URL for ClickUp integration
  source_metadata: Json | null
  
  // Images
  image_url: string | null                       // Main campaign image (Cloudinary/ImageKit)
  image_width: number | null
  image_height: number | null
  actual_image_width: number | null              // After CDN resize
  actual_image_height: number | null
  cloudinary_public_id: string | null
  
  // Slicing results
  slices: Json | null                            // SliceOutput[] with borders, alt text, links
  footer_start_percent: number | null            // Where footer begins (0-100)
  
  // Copy (subject line + preview text)
  provided_subject_line: string | null           // User-provided from plugin
  provided_preview_text: string | null
  generated_subject_lines: Json | null           // [string x 10] from early generation
  generated_preview_texts: Json | null           // [string x 10]
  selected_subject_line: string | null           // Final choice
  selected_preview_text: string | null
  copy_source: string | null                     // 'clickup' | 'figma' | 'ai'
  
  // QA results
  spelling_errors: Json | null                   // SpellingError[]
  qa_flags: Json | null                          // { errors, warnings, notes }
  
  // Processing state
  status: string | null                          // 'processing', 'ready_for_review', 'sent_to_klaviyo', 'error'
  processing_step: string | null                 // Current step name
  processing_percent: number | null              // 0-100 progress
  processing_completed_at: string | null
  error_message: string | null
  retry_count: number | null
  retry_from_step: string | null
  
  // Klaviyo publishing
  klaviyo_template_id: string | null
  klaviyo_campaign_id: string | null
  klaviyo_campaign_url: string | null
  sent_to_klaviyo_at: string | null
  
  // Segment selection
  selected_segment_preset_id: string | null (FK)
  
  // ClickUp integration
  clickup_task_id: string | null
  clickup_task_url: string | null
  
  // Name
  name: string | null
  
  created_at: string | null
  updated_at: string | null
}
```
**RLS:** Filtered by `user_id = auth.uid()`.  
**Realtime:** Frontend listens for changes on this table.

#### **campaigns** (legacy/archive)
```typescript
{
  id: string
  user_id: string (implied, not in schema)
  brand_id: string (FK)
  name: string
  status: string                                 // 'processing', 'error', 'ready'
  
  // Original image
  raw_image_url: string | null
  original_image_url: string | null
  cloudinary_public_id: string | null
  
  // Processing results
  vision_data: Json | null
  campaign_analysis: Json | null
  blocks: Json | null
  module_boundaries: Json | null
  generated_html: string | null
  generated_copy: Json | null
  
  // Status tracking
  processing_step: string | null
  processing_percent: number | null
  processing_completed_at: string | null
  error_message: string | null
  
  // Klaviyo
  klaviyo_template_id: string | null
  
  // Thumbnails
  thumbnail_url: string | null
  
  created_at: string
  updated_at: string
}
```
**Status:** Largely superseded by `campaign_queue`. Kept for historical records.

#### **brand_footers** (footer templates)
```typescript
{
  id: string
  brand_id: string (FK)
  name: string
  html: string                                   // Final footer HTML with Klaviyo tags
  footer_type: string | null                     // e.g., 'dark', 'light'
  is_primary: boolean | null                     // Flag primary footer per brand
  
  // Image slices for footer builder
  image_slices: Json | null                      // SliceOutput[] for the footer image
  
  // Logos (extracted from footer or uploaded)
  logo_url: string | null
  logo_public_id: string | null
  
  created_at: string
  updated_at: string
}
```

#### **segment_presets** (Klaviyo segment combinations)
```typescript
{
  id: string
  brand_id: string (FK)
  name: string
  description: string | null
  included_segments: Json                        // [segmentId, ...]
  excluded_segments: Json                        // [segmentId, ...]
  is_default: boolean
  created_at: string
  updated_at: string
}
```

#### **processing_jobs** + **footer_processing_jobs**
```typescript
// processing_jobs
{
  id: string
  campaign_id: string | null (FK)
  brand_id: string | null (FK)
  job_type: string
  status: string | null                          // 'pending', 'running', 'completed', 'error'
  priority: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string | null
  error_message: string | null
}

// footer_processing_jobs (similar structure, for footer pipeline)
{
  id: string
  brand_id: string
  image_url: string
  image_width: number | null
  image_height: number | null
  cloudinary_public_id: string | null
  slices: Json | null
  status: string | null
  processing_step: string | null
  processing_percent: number | null
  processing_completed_at: string | null
  error_message: string | null
  legal_cutoff_y: number | null
  legal_section: Json | null
  source: string
  source_url: string | null
  created_at: string | null
  updated_at: string | null
  user_id: string
}
```

#### **early_generated_copy** + **early_spelling_check**
```typescript
// early_generated_copy (async pre-computed)
{
  id: string
  session_key: string (PK)
  image_url: string | null
  brand_id: string | null (FK)
  subject_lines: Json | null                     // [string x 10]
  preview_texts: Json | null                     // [string x 10]
  spelling_errors: Json | null
  created_at: string | null
  expires_at: string | null                      // 1 hour TTL
}

// early_spelling_check (similar)
{
  id: string
  session_key: string (PK)
  image_url: string | null
  spelling_errors: Json | null
  has_errors: boolean | null
  created_at: string | null
  expires_at: string | null
}
```

#### **footer_editor_sessions** (conversational footer editor state)
```typescript
{
  id: string
  user_id: string
  brand_id: string (FK)
  reference_image_url: string
  current_html: string
  conversation_history: Json                     // [{ role, content }, ...]
  footer_name: string | null
  figma_design_data: Json | null
  vision_data: Json | null
  created_at: string
  updated_at: string
}
```

#### **modules** (reusable email module library)
```typescript
{
  id: string
  campaign_id: string (FK)
  brand_id: string (FK)
  module_index: number
  module_type: string                            // 'hero', 'product_grid', 'footer', etc
  module_type_confidence: number | null
  image_url: string
  thumbnail_url: string | null
  width: number
  height: number
  y_start: number
  y_end: number
  layout: Json | null
  content: Json | null
  visuals: Json | null
  composition_notes: string | null
  is_reference_quality: boolean | null
  quality_score: number | null
  embedding: string | null
  created_at: string | null
  updated_at: string | null
}
```

#### **plugin_tokens** (Figma plugin authentication)
```typescript
{
  id: string
  user_id: string
  token: string                                  // Random long string
  name: string | null                            // User-assigned label
  created_at: string | null
  last_used_at: string | null
}
```

#### **sitemap_import_jobs**
```typescript
// Async tracking for sitemap crawls
```

### RLS Policies
- **profiles:** Users can only see/edit their own row
- **brands:** Users can only see brands where `user_id = auth.uid()`
- **campaign_queue:** Users can only see their own queued campaigns
- **brand_link_index:** Scoped to user's brands
- **segment_presets:** Scoped to user's brands
- All data-modifying operations in edge functions use `service_role` key for privilege escalation

---

## 3. EDGE FUNCTIONS INVENTORY

**Total:** 51 functions in `supabase/functions/`  
**All:** `verify_jwt = false` in config.toml (security: RLS + manual auth checks required)

### Campaign Processing Pipeline (Hot Path)

#### **figma-ingest** (232 lines)
**File:** `supabase/functions/figma-ingest/index.ts`
- **Input:** Figma plugin export (frames as base64, metadata)
- **Output:** campaign_queue entry, image uploaded to ImageKit
- **Auth:** Plugin token validation against `plugin_tokens` table
- **External APIs:** ImageKit (image upload)
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`
- **Security:** Plugin token is bearer token; no per-frame validation
- **Flow:**
  1. Validate plugin token → get user_id
  2. Validate optional brandId matches user
  3. Upload frame(s) to ImageKit
  4. Insert campaign_queue row with status='processing'
  5. Fire async `process-campaign-queue`

#### **process-campaign-queue** (1505 lines) — ORCHESTRATOR
**File:** `supabase/functions/process-campaign-queue/index.ts`
- **Input:** campaign_queue.id
- **Output:** Updated campaign_queue with slices, copy, links
- **External APIs:**
  - Anthropic Claude (auto-slice-v2, generate-email-copy-early, analyze-slices, qa-spelling-check)
  - Google Cloud Vision (OCR, object detection, logo detection)
  - ClickUp API (copy search, optional)
  - Firecrawl (link resolution fallback)
  - Cloudinary/ImageKit (image CDN transforms)
- **Secrets:** `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Process:**
  1. Fetch queue item by ID
  2. Step 1: Fetch + resize image (CDN transforms, chunked base64)
  3. Step 1.5: Fire early SL/PT generation async (doesn't await)
  4. Step 1.5b: Optional ClickUp search (if configured)
  5. Step 2: ~~Brand detection~~ REMOVED (manual selection via plugin)
  6. Step 3: Auto-slice (auto-slice-v2) with optional link intelligence
  7. Step 3.5: Crop slices and upload to Cloudinary (parallel)
  8. Step 4: Analyze slices (alt text, links, web search)
  9. Step 5: Poll early_generated_copy (2s intervals, max 12s)
  10. Step 6: QA spelling check
  11. Step 7: Merge + finalize, set status='ready_for_review'
- **Est. Duration:** 90–120s total
- **Parallelization:**
  - Early copy generation (Steps 1.5, 1.5b run async, don't block)
  - Vision API calls in auto-slice-v2 (3 parallel: OCR, objects, logos)
  - Slice uploads (Step 3.5 parallel Promise.all)
- **Image Handling:**
  - Max 600px wide × 7900px tall (CDN resized before fetch)
  - Chunked base64 conversion (32KB chunks) to avoid stack overflow
  - Detects MIME type from response headers (ImageKit may convert PNG → JPEG)

#### **auto-slice-v2** (2031 lines) — CORE ALGORITHM
**File:** `supabase/functions/auto-slice-v2/index.ts`
- **Input:** Image base64 + MIME type, optional link intelligence
- **Output:** SliceOutput[] with boundaries, footer start, optionally link assignments + fine-print content
- **External APIs:**
  - Google Cloud Vision (3 parallel calls):
    - DOCUMENT_TEXT_DETECTION (OCR)
    - OBJECT_LOCALIZATION (product detection)
    - LOGO_DETECTION (brand logos)
  - Anthropic Claude Sonnet 4.5 (final decisions)
- **Secrets:** `GOOGLE_CLOUD_VISION_API_KEY`, `ANTHROPIC_API_KEY`
- **Key Algorithm:**
  ```
  Layer 1: Google Vision OCR
    → Extract paragraphs with bounding boxes
  
  Layer 2: Google Vision Objects
    → Detect products/objects
  
  Layer 3: Google Vision Logos
    → Detect brand logos
  
  Layer 4: Claude (SOLE DECISION MAKER)
    → Receives raw Vision data (coordinates, text, objects)
    → Decides all slice boundaries, footer cutoff, horizontal splits
    → Returns ClaudeDecision with slices[] and footer_start
  ```
- **Image Resizing:** Max 7900px height before Claude (under 8000px limit). Returns `analyzedWidth`/`analyzedHeight` for coordinate scaling.
- **Horizontal Splits:** Detects side-by-side products/CTAs; returns `horizontalSplit: { columns, gutterPositions }` for multi-column rows.
- **Footer Detection:** Claude determines where footer begins; **guardrail:** if footer detected <55% of image height, it's likely a false positive (marketing section header), so override to 100%.
- **Link Intelligence (Optional):**
  - If `linkIndex` provided, Claude can pre-assign links and sources
  - Sanitizes link values (must be valid http/https URLs, rejects placeholders)
- **Fine Print Extraction:**
  - For footer mode, extracts legal/compliance text as structured JSON
  - Returns `finePrintContent` with org name, address, font size, alignment
- **Output:**
  ```typescript
  {
    success: boolean
    slices: [{
      name: string (hero, product, cta, footer, fine_print)
      yTop, yBottom: number (% of image height)
      hasCTA: boolean
      ctaText: string | null
      horizontalSplit?: { columns, gutterPositions }
      isClickable: boolean
      link: string | null (when link intelligence used)
      altText: string
      linkSource: 'index' | 'default' | 'rule' | 'needs_search' | 'not_clickable'
    }]
    footerStartY: number
    imageHeight, imageWidth: number
    analyzedWidth, analyzedHeight: number
    finePrintContent?: FinePrintContent | null
    debug: { ... }
  }
  ```
- **Prompts:** Separate detailed prompts for email mode vs footer mode. Footer prompts explicitly forbid logo cross-contamination.
- **Guardrails:**
  - Footer must start >55% down
  - First slice yTop always 0
  - No overlapping slices
  - Coordinate scaling via scaleFactor for resized images

#### **analyze-slices** (651 lines)
**File:** `supabase/functions/analyze-slices/index.ts`
- **Input:** Slice images, brand domain, known product URLs, campaign context
- **Output:** Alt text, suggested links, clickability flags, verification status
- **External APIs:**
  - Anthropic Claude Sonnet 4.5 (with tools)
  - web_search_20250305 (Claude tool)
  - web_fetch_20250910 (Claude tool)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Process:**
  1. **Brand Learning System:** Checks `brands.all_links` for cached product→URL mappings
  2. **Link Resolution:**
     - Check cache first (brands.all_links)
     - Use Claude web_search to find product pages
     - Use Claude web_fetch to crawl collection pages (if search returns collections)
     - Verify URLs with HTTP 200 check (set `linkVerified: true` only on success)
  3. **Evergreen URL Preference:** Rejects promotional URLs (containing "10-off", "flash-sale", etc.); prefers stable paths like `/collections/new-arrivals`
  4. **Save New Discoveries:** Updates `brands.all_links` with newly found URLs for future use
- **Output per Slice:**
  ```typescript
  {
    altText: string
    suggestedLink: string | null
    isClickable: boolean
    linkVerified: boolean
  }
  ```
- **Parallelization:** All slices analyzed in parallel, but image URLs must be ready first (Step 3.5 prerequisite).

#### **generate-email-copy-early** (521 lines)
**File:** `supabase/functions/generate-email-copy-early/index.ts`
- **Input:** Campaign image base64, optional brand context
- **Output:** 10 subject lines, 10 preview texts, spelling errors
- **Model:** Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Key Features:**
  - **Fire-and-forget:** Called async from process-campaign-queue (doesn't block)
  - **Session Key:** Uses Cloudinary public ID as unique key
  - **Chunked Base64:** Processes large images in 32KB chunks
  - **TTL:** Results expire after 1 hour
  - **Fallback:** Stored in `early_generated_copy` table for polling
- **Uses base64 directly** (NEW optimization in process-campaign-queue—avoids re-download)
- **Prompt Focus:** Generate 10 diverse SL/PT combos, flag spelling errors

#### **generate-email-copy** (456 lines)
**File:** `supabase/functions/generate-email-copy/index.ts`
- **Input:** Campaign image base64, brand name, campaign context
- **Output:** Subject line, preview text, additional copy
- **Model:** Claude Sonnet 4
- **Similar to early generation but** synchronous, runs later if early generation times out

#### **qa-spelling-check** / **qa-spelling-check-early** (94 + 144 lines)
- **Model:** Claude Sonnet 4
- **Input:** Campaign image
- **Output:** SpellingError[] (conservative—only obvious typos)
- **Early version:** Async, expires in 1 hour

#### **search-clickup-for-copy** (425 lines)
**File:** `supabase/functions/search-clickup-for-copy/index.ts`
- **Input:** Figma URL, ClickUp API key, workspace/list ID
- **Output:** Subject line, preview text from matched task
- **Model:** Gemini 2.5 Flash Lite (via Lovable AI Gateway)
- **External APIs:** ClickUp API v2/v3
- **Secrets:** `LOVABLE_API_KEY`
- **Process:**
  1. Extract Figma file key from URL
  2. Search ClickUp for tasks containing Figma URL
  3. Use Gemini to extract copy from task content
  4. Return structured data
- **Conditional:** Only runs if brand has ClickUp integration configured

#### **match-slice-to-link** (501 lines)
**File:** `supabase/functions/match-slice-to-link/index.ts`
- **Input:** Slice description, brand_id, campaign context
- **Output:** Matched URL, confidence, source
- **External APIs:**
  - Anthropic Claude Haiku (small catalogs) or Sonnet 4.5 (vector search)
- **Secrets:** `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Two-Tier Strategy:**
  - **Small catalog (<50 links):** Claude Haiku reviews full list
  - **Large catalog (≥50 links):** pgvector similarity search + Claude confirmation
- **Generic CTA Handling:**
  1. Check brand rules first (explicit routing)
  2. Fall back to index matching (rich product name from slice description)
  3. Fall back to brand default URL
- **Fallback:** Returns `no_match` if index query fails; caller uses Firecrawl

#### **resolve-slice-links** (389 lines)
**File:** `supabase/functions/resolve-slice-links/index.ts`
- **Input:** Slices with `needsLinkSearch` markers from auto-slice-v2
- **Output:** Resolved links via Firecrawl web search
- **External APIs:** Firecrawl (web search + scraping)
- **Secrets:** `FIRECRAWL_API_KEY`
- **Process:**
  1. For each slice marked `needsLinkSearch`, use Firecrawl to find product URL
  2. Verify URL is healthy (HTTP 200)
  3. Update slice with link

#### **generate-slice-html** (474 lines)
**File:** `supabase/functions/generate-slice-html/index.ts`
- **Input:** Slice image URL, slice description, Figma design context (optional)
- **Output:** Email-safe HTML for that slice
- **Model:** Claude Sonnet 4
- **External APIs:** Anthropic, Figma (optional design data)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Key Rules:**
  - Table-based layout only (no divs, flexbox, grid)
  - Inline styles (no `<style>` blocks)
  - Full-width CTA buttons (not fixed-width centered)
  - Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`
  - Standard padding: `5%` horizontal, `32px` top, `24px` bottom
- **Figma Data:** If provided, Claude uses exact measurements (colors, fonts, spacing) from design
- **Reference Example:** Uses high-quality HTML pattern in system prompt for quality anchoring
- **Output:** Raw HTML table rows (can be inserted directly into email template)

#### **refine-slice-html** (382 lines)
**File:** `supabase/functions/refine-slice-html/index.ts`
- **Input:** HTML from generate-slice-html, optional refinement instructions
- **Output:** Improved HTML
- **Model:** Claude Sonnet 4
- **Process:** Iterative refinement loop (chat-based)

#### **refine-campaign** (484 lines)
**File:** `supabase/functions/refine-campaign/index.ts`
- **Input:** Campaign with all slices, copy, QA results
- **Output:** Final QA + assembly
- **Model:** Claude Sonnet 4
- **Secrets:** `ANTHROPIC_API_KEY`

---

### Footer Pipeline (Sub-System)

#### **auto-slice-footer** (391 lines)
**File:** `supabase/functions/auto-slice-footer/index.ts`
- **Input:** Footer image base64
- **Output:** SliceOutput[] (footer-specific slices)
- **Uses:** auto-slice-v2 with footer-mode flag
- **Key:** Entire image is footer; no marketing content above

#### **detect-footer-region** (TBD)
- **Input:** Footer image
- **Output:** Detected footer boundaries

#### **detect-footer-socials** (270 lines)
**File:** `supabase/functions/detect-footer-socials/index.ts`
- **Input:** Footer image
- **Output:** Detected social icons with URLs

#### **detect-footer-links** (668 lines)
**File:** `supabase/functions/detect-footer-links/index.ts`
- **Input:** Footer image, brand name, domain
- **Output:** Detected navigation/footer links
- **External APIs:** Firecrawl, Anthropic Claude
- **Secrets:** `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`

#### **generate-footer-html** (432 lines)
**File:** `supabase/functions/generate-footer-html/index.ts`
- **Input:** Reference image, logo URLs, social icons, brand colors, allLinks
- **Output:** Email-safe footer HTML with Klaviyo tags
- **Model:** Claude Opus 4 (complex generation)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Key Rules:**
  - Total width MUST be 600px
  - Table-based layout
  - MUST include Klaviyo merge tags: `{% unsubscribe_link %}`, `{% manage_preferences_link %}`, `{{ organization.name }}`, `{{ organization.address }}`
  - Logo must be `<img>` tag (not text)
  - Streaming response (SSE) for long generation times
- **Process:** Initial generation, then iterative refinement via vision diff loop
- **Output:** HTML with embedded Klaviyo dynamic content blocks

#### **refine-footer-html** (382 lines)
**File:** `supabase/functions/refine-footer-html/index.ts`
- **Input:** Current footer HTML, reference image, refinement instructions
- **Output:** Refined footer HTML
- **Model:** Claude Sonnet 4 or Opus 4
- **Vision Diff Loop:** Uses `footerVisionDiff.ts` library to compare rendered HTML vs reference image

#### **analyze-footer-render** (629 lines)
**File:** `supabase/functions/analyze-footer-render/index.ts`
- **Input:** Rendered footer HTML screenshot, reference image
- **Output:** Diff analysis (layout offsets, color mismatches, etc)
- **External APIs:** Google Vision API (for both images)
- **Secrets:** `GOOGLE_CLOUD_VISION_API_KEY`

#### **analyze-footer-reference** (693 lines)
**File:** `supabase/functions/analyze-footer-reference/index.ts`
- **Input:** Reference footer image
- **Output:** Structured analysis (colors, logos, social icons, layout)
- **Model:** Claude Sonnet 4 (with vision)
- **Secrets:** `ANTHROPIC_API_KEY`

#### **process-footer-queue** (953 lines)
**File:** `supabase/functions/process-footer-queue/index.ts`
- **Input:** footer_processing_jobs.id
- **Output:** Updated footer_processing_jobs with status, HTML
- **Orchestrator:** Similar role to process-campaign-queue for footer pipeline
- **Steps:**
  1. auto-slice-footer
  2. detect-footer-socials + detect-footer-links (parallel)
  3. extract-section-assets (logo/icons via Cloudinary)
  4. generate-footer-html
  5. Vision diff loop: analyze-footer-render vs reference
  6. refine-footer-html until convergence

#### **extract-section-assets** (245 lines)
**File:** `supabase/functions/extract-section-assets/index.ts`
- **Input:** Slice with image, section type
- **Output:** Extracted and optimized assets (logo, icons)
- **External APIs:** Cloudinary (cropping, transforms)
- **Process:** Crops slices from footer, uploads as separate assets

#### **footer-conversation** (505 lines)
**File:** `supabase/functions/footer-conversation/index.ts`
- **Input:** User message, footer_editor_sessions.id, reference image
- **Output:** Conversation response + updated HTML
- **Model:** Claude Sonnet 4 (chat)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Maintains:** Conversation history in footer_editor_sessions

#### **generate-simple-footer** (TBD)
- **Input:** Brand colors, logo, socials
- **Output:** Simple footer HTML (faster, simpler than generate-footer-html)

---

### Brand Intelligence Pipeline

#### **detect-brand-from-image** (285 lines)
**File:** `supabase/functions/detect-brand-from-image/index.ts`
- **Input:** Campaign image, existing brands list
- **Output:** Matched brand ID or new brand suggestion
- **Model:** Claude Sonnet 4 (with web_search_20250305)
- **Secrets:** `ANTHROPIC_API_KEY`
- **Status:** Largely removed from main pipeline (manual selection via plugin now)
- **Still used:** Admin/fallback workflows

#### **analyze-brand** (TBD)
- **Input:** Brand domain
- **Output:** Brand profile (colors, fonts, typography, links)
- **External APIs:** Firecrawl
- **Secrets:** `FIRECRAWL_API_KEY`

#### **crawl-brand-site** (356 lines)
**File:** `supabase/functions/crawl-brand-site/index.ts`
- **Input:** Brand domain, depth limit
- **Output:** Discovered URLs, sitemap structure
- **External APIs:** Firecrawl (site crawl + scraping)
- **Secrets:** `FIRECRAWL_API_KEY`
- **Stores:** Results in brand_link_index

#### **import-sitemap** (511 lines)
**File:** `supabase/functions/import-sitemap/index.ts`
- **Input:** Brand domain, optional sitemap URL
- **Output:** Parsed URLs from sitemap
- **External APIs:** HTTP fetch (sitemap.xml)
- **Process:**
  1. Fetch sitemap.xml
  2. Parse XML for URLs
  3. Filter and validate
  4. Store in brand_link_index

#### **trigger-sitemap-import** (TBD)
- **Input:** Brand ID
- **Output:** Kicks off async import-sitemap job

#### **weekly-link-recrawl** (TBD)
- **Scheduled:** Runs weekly via Supabase cron
- **Input:** Brand ID
- **Output:** Updated brand_link_index with recrawled URLs

#### **get-brand-link-index** (TBD)
- **Input:** Brand ID
- **Output:** All links in index with metadata

#### **add-brand-link** (TBD)
- **Input:** Brand ID, URL, title, link_type
- **Output:** New link added to index

#### **delete-brand-link** (TBD)
- **Input:** Brand ID, link ID
- **Output:** Link removed from index

#### **update-brand-link-preferences** (TBD)
- **Input:** Brand ID, new preferences
- **Output:** Updated brand.link_preferences

#### **generate-embedding** (TBD)
- **Input:** Text/URL
- **Output:** pgvector embedding (OpenAI text-embedding-3-small)
- **External APIs:** OpenAI embeddings API
- **Secrets:** `OPENAI_API_KEY`
- **Used by:** match-slice-to-link (vector similarity search)

---

### Klaviyo Publishing

#### **push-to-klaviyo** (524 lines)
**File:** `supabase/functions/push-to-klaviyo/index.ts`
- **Input:** Slices (or single image), footer HTML, template name, Klaviyo API key, mode ('template'|'campaign')
- **Output:** Template ID (mode='template') or Campaign ID + URL (mode='campaign')
- **External APIs:** Klaviyo API
- **Secrets:** Brand's `klaviyo_api_key` (plaintext from database - SECURITY ISSUE)
- **Key Process:**
  1. **Build HTML:**
     - Iterate over slices, assign to rows by rowIndex
     - Generate multi-column tables for horizontal splits (using nested tables)
     - Wrap in Klaviyo `data-klaviyo-region="true"` divs
     - Append footer HTML
  2. **Create Template:**
     - POST to `https://a.klaviyo.com/api/templates`
     - `editor_type: 'USER_DRAGGABLE'`
     - `revision: '2025-01-15'`
  3. **Create Campaign (optional):**
     - POST to `https://a.klaviyo.com/api/campaigns`
     - Assign template + segments (included/excluded)
     - Subject line + preview text
     - `revision: '2025-10-15'`
- **Multi-Column Support:**
  ```html
  <tr>
    <td align="center" style="padding: 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td data-klaviyo-region="true" width="50%">
            <!-- Column 1 -->
          </td>
          <td data-klaviyo-region="true" width="50%">
            <!-- Column 2 -->
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ```
- **Validation:** Requires Klaviyo API key (must be present on brand or passed directly)

#### **get-klaviyo-lists** (TBD)
- **Input:** Klaviyo API key
- **Output:** List of all segments
- **External APIs:** Klaviyo API

#### **get-segment-size** (TBD)
- **Input:** Segment ID, Klaviyo API key
- **Output:** Segment size

#### **scrape-klaviyo-copy** (TBD)
- **Input:** Klaviyo template ID, API key
- **Output:** Extracted copy (subject, preview, body)
- **External APIs:** Klaviyo API

---

### Figma Integration

#### **figma-ingest** (already covered above)

#### **fetch-figma-design** (513 lines)
**File:** `supabase/functions/fetch-figma-design/index.ts`
- **Input:** Figma file key, token
- **Output:** Design context (colors, fonts, layout)
- **External APIs:** Figma REST API
- **Secrets:** `FIGMA_ACCESS_TOKEN`

#### **figma-to-email-html** (523 lines)
**File:** `supabase/functions/figma-to-email-html/index.ts`
- **Input:** Figma design data (colors, text, structure)
- **Output:** Email HTML
- **Model:** Claude Sonnet 4
- **Secrets:** `ANTHROPIC_API_KEY`

---

### ClickUp Integration

#### **get-clickup-hierarchy** (TBD)
- **Input:** ClickUp API key
- **Output:** Workspace → team → space → list hierarchy

#### **search-clickup-for-copy** (already covered above)

---

### Image & Asset Handling

#### **upload-to-cloudinary** (TBD)
- **Input:** Image base64, folder
- **Output:** Cloudinary URL
- **External APIs:** Cloudinary API
- **Secrets:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

#### **upload-to-imagekit** (TBD)
- **Input:** Image base64, folder
- **Output:** ImageKit URL
- **External APIs:** ImageKit API
- **Secrets:** `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`

#### **upload-social-icon** (TBD)
- **Input:** Icon image, platform name
- **Output:** Uploaded icon URL
- **External APIs:** Cloudinary
- **Secrets:** `CLOUDINARY_*`

#### **process-brand-logo** (TBD)
- **Input:** Logo image
- **Output:** Processed logo (optimized, resized)
- **External APIs:** Cloudinary

#### **invert-logo** (TBD)
- **Input:** Logo URL
- **Output:** Inverted logo (for dark background compatibility)
- **External APIs:** Cloudinary (negate transformation)
- **Secrets:** `CLOUDINARY_*`

---

### Plugin & Auth

#### **get-plugin-brands** (TBD)
- **Input:** Plugin token
- **Output:** Brands available to user
- **Auth:** Token validation

---

### Summary Table

| Category | Function | Lines | Model | Hot Path |
|----------|----------|-------|-------|----------|
| **Pipeline** | figma-ingest | 232 | — | Y |
| — | process-campaign-queue | 1505 | Claude/Gemini | Y |
| — | auto-slice-v2 | 2031 | Vision + Claude | Y |
| — | analyze-slices | 651 | Claude | Y |
| — | generate-email-copy-early | 521 | Claude | Y |
| — | generate-slice-html | 474 | Claude | Y |
| — | push-to-klaviyo | 524 | — | Y |
| **Footer** | process-footer-queue | 953 | Claude/Opus | N |
| — | generate-footer-html | 432 | Opus | N |
| — | analyze-footer-render | 629 | Vision | N |
| **Brand** | crawl-brand-site | 356 | — | N |
| — | import-sitemap | 511 | — | N |
| **Links** | match-slice-to-link | 501 | Claude | Y |
| — | resolve-slice-links | 389 | Firecrawl | Y |
| **Utility** | upload-to-cloudinary | ? | — | N |
| — | generate-embedding | ? | OpenAI | N |

**Total Functions:** 51 (all listed in config.toml)

---

## 4. THE SLICING ALGORITHM (auto-slice-v2 Deep Dive)

**File:** `/Users/jackstringer/design-to-email-flow/supabase/functions/auto-slice-v2/index.ts` (2031 lines)

### Architecture: 4-Layer Decision System

```
Layer 1: Google Vision OCR (Data Gathering)
  ↓ extracts paragraphs with bounding boxes (yTop, yBottom, xLeft, xRight, confidence)
  
Layer 2: Google Vision Objects (Data Gathering)
  ↓ detects products, logos, UI elements (name, score, coordinates)
  
Layer 3: Google Vision Logos (Data Gathering)
  ↓ identifies brand logos (description, score, coordinates)
  
Layer 4: Claude (SOLE DECISION MAKER)
  ↓ receives raw Vision data (coordinates, text, objects, logos)
  → Makes ALL decisions:
    - Slice boundaries (yTop, yBottom)
    - Footer detection (footerStartY)
    - Horizontal splits (side-by-side columns)
    - Link assignments (if link intelligence provided)
    - Fine-print extraction (for footers)
  ↓ returns ClaudeDecision JSON
```

### Key Prompts

#### **Email Mode Prompt** (lines 994–1179)
**Focus Areas:**
1. **Slice Types:** Hero, product grid, CTA button, testimonial, collection, fine print, etc.
2. **Horizontal Splits:** Side-by-side products/CTAs must be in separate columns (each gets own link)
3. **Button Text:** Different button text (e.g., "SHOP FOR HIM" vs "SHOP FOR HER") = separate slices
4. **CTA Detection:** Identifies if a slice has a call-to-action (hasCTA, ctaText)
5. **Link Intelligence:** If brand link index provided, Claude can pre-assign URLs + sources
6. **Footer Guardrail:** Warns if footer detected <55% down (likely false positive)
7. **Coordinate Scaling:** Accounts for image resizing; returns both analyzed and original dimensions

**Example Slice Definition:**
```json
{
  "name": "hero",
  "yTop": 0,
  "yBottom": 250,
  "hasCTA": true,
  "ctaText": "Shop New Arrivals",
  "horizontalSplit": null,
  "isClickable": true,
  "link": "https://brand.com/collections/new-arrivals",
  "altText": "Hero banner showing new collection",
  "linkSource": "index"
}
```

#### **Footer Mode Prompt** (lines 683–929)
**Focus Areas:**
1. **Image is ALL footer:** No marketing content above
2. **Section Types:**
   - `logo` (brand logo, clickable to homepage)
   - `navigation_links` (horizontal text links—MUST use horizontalSplit)
   - `social_icons` (platform icons—MUST use horizontalSplit, count icons)
   - `cta_button` (e.g., "Join Facebook Group")
   - `badge_row` (certifications, not clickable)
   - `fine_print` (legal text, extracted as structured content)
3. **Fine Print Extraction:**
   - Only if legal/compliance text ACTUALLY VISIBLE
   - Extract: rawText, detectedOrgName, detectedAddress, font size, alignment, colors
   - Includes flags: hasUnsubscribeText, hasManagePreferences, hasCopyright
4. **Horizontal Splits:**
   - Social icons: count actual icons, set columns + gutterPositions
   - Navigation: count links, set columns + gutterPositions
5. **Spacing Rules:**
   - Cut in CENTER of visual gaps between sections
   - Never cut through text/logos/icons
   - 30–50px padding from text bounding boxes
6. **Button Separation:**
   - Multiple buttons with different text = separate slices (even if identical styling)

### Coordinate Scaling

**Problem:** Image may be resized before sending to Claude (max 7900px height)

**Solution:**
```typescript
// In process-campaign-queue, Step 3.5:
scaleFactor = originalHeight / analyzedHeight

// Claude returns decision in "analyzed" coordinate space
// We invert to original space:
const actualYTop = slice.yTop / scaleFactor
const actualYBottom = slice.yBottom / scaleFactor
```

### Link Sanitization

**Rules:**
```typescript
sanitizeLink(link, linkSource):
  - If linkSource === 'needs_search' → return null
  - Reject placeholder strings: 'needs_search', 'none', 'null', '', 'undefined', 'n/a', 'tbd'
  - Must start with http:// or https://
  - Return original URL (preserves case + params)
```

### Footer Cutoff Guardrail

**Problem:** Claude may misidentify marketing section headers (e.g., "FOR HER", "SUMMER SALE") as footer/nav

**Guardrail:**
```
If footerStartPercent < 55:
  console.log("WARNING: Footer too early, likely false positive")
  Override footerStartY → imageHeight (100%)
  Set footerStartPercent → 100
```

This prevents cutting off 40% of the campaign when Claude mistakes a section header for footer.

### Image Resizing

**Strategy:** CDN URL transformations (zero-memory server-side cropping)

```typescript
// In process-campaign-queue, Step 1:
const resizedUrl = getResizedCloudinaryUrl(imageUrl, 600, 7900)
// Cloudinary URL: https://res.cloudinary.com/.../c_limit,w_600,h_7900/...

// Fetch resized image as base64
const response = await fetch(resizedUrl)
const contentType = response.headers.get('content-type') // ← CRITICAL: ImageKit may return JPEG
const buffer = await response.arrayBuffer()

// Chunked base64 conversion (32KB chunks) to avoid stack overflow
const uint8Array = new Uint8Array(buffer)
const CHUNK_SIZE = 32768
let binary = ''
for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
  const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length))
  binary += String.fromCharCode(...chunk)
}
const base64 = btoa(binary)
```

**Why chunked?** String concatenation in a loop is O(n²) for large binary data. Chunking avoids stack overflow on huge images.

### Horizontal Split Detection

**Use Case:** Side-by-side products or CTAs in a single slice

**Example:**
```json
{
  "name": "product_grid",
  "yTop": 300,
  "yBottom": 600,
  "horizontalSplit": {
    "columns": 2,
    "gutterPositions": [50]  // 50% marks the divider
  },
  // When pushed to Klaviyo, becomes nested table:
  // <table><tr>
  //   <td width="50%">...</td>
  //   <td width="50%">...</td>
  // </tr></table>
}
```

**Claude detects:**
- Parallel buttons with different text (e.g., "SHOP FOR HIM" vs "SHOP FOR HER")
- Product grid columns (2, 3, 4, 5, 6 columns detected)
- Social icon rows (counts platform icons)

---

## 5. FOOTER PIPELINE (DETAILED)

**Files:**
- `supabase/functions/process-footer-queue/index.ts` (953 lines) — orchestrator
- `supabase/functions/auto-slice-footer/index.ts` (391 lines)
- `supabase/functions/detect-footer-socials/index.ts` (270 lines)
- `supabase/functions/detect-footer-links/index.ts` (668 lines)
- `supabase/functions/generate-footer-html/index.ts` (432 lines)
- `supabase/functions/refine-footer-html/index.ts` (382 lines)
- `supabase/functions/analyze-footer-render/index.ts` (629 lines)
- `src/lib/footerVisionDiff.ts` — vision-diff convergence loop

### Flow

```
1. User uploads footer image or selects footer builder
2. process-footer-queue triggered
   ├─ auto-slice-footer (Vision + Claude)
   │   └─ Identifies logo, nav, social icons, fine print sections
   │
   ├─ detect-footer-socials (Vision + Claude)
   │   └─ Identifies social platforms, extracts icon coords
   │
   ├─ detect-footer-links (Vision + Claude + Firecrawl)
   │   └─ Identifies navigation links, scrapes brand site for URLs
   │
   ├─ extract-section-assets (Cloudinary)
   │   └─ Crops logo, icons from footer image
   │
   ├─ generate-footer-html (Claude Opus 4)
   │   └─ Builds 600px-wide HTML with:
   │      • Logo image (light or dark variant)
   │      • Social icon links (to actual platforms)
   │      • Navigation links
   │      • Klaviyo merge tags:
   │        - {% unsubscribe_link %}
   │        - {% manage_preferences_link %}
   │        - {{ organization.name }}
   │        - {{ organization.address }}
   │
   ├─ Vision Diff Loop (iterative refinement):
   │   ├─ Render generated HTML to screenshot
   │   ├─ analyze-footer-render (Vision API on both images)
   │   ├─ Compare rendered vs reference:
   │   │   • Layout offsets (spacing, alignment)
   │   │   • Colors (background, text)
   │   │   • Logo/icon placement
   │   ├─ If diffs exceed tolerance:
   │   │   └─ refine-footer-html (Claude fixes issues)
   │   └─ Repeat until convergence (max ~5 iterations)
   │
   └─ Store final HTML in brand_footers table
```

### Key Inputs

**generate-footer-html receives:**
- `referenceImageUrl` — footer design to replicate
- `logoUrl`, `lightLogoUrl`, `darkLogoUrl` — brand logos
- `socialIcons` — array of { platform, url, iconUrl }
- `brandName`, `brandColors` — brand identity
- `websiteUrl` — homepage link
- `allLinks` — list of brand navigation URLs

### Key Outputs

**Footer HTML Structure:**
```html
<!-- Outer wrapper (100% width for centering) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center">
      <!-- Inner content (EXACTLY 600px) -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 600px; max-width: 600px;">
        
        <!-- Logo section -->
        <tr>
          <td align="center" style="padding: 32px 0;">
            <img src="{logoUrl}" alt="Brand" width="120" height="40" style="display: block; border: 0;">
          </td>
        </tr>
        
        <!-- Navigation links (with horizontal split if multiple) -->
        <tr>
          <td>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td width="50%"><a href="...">Shop</a></td>
                <td width="50%"><a href="...">About</a></td>
              </tr>
            </table>
          </td>
        </tr>
        
        <!-- Social icons (with horizontal split for each platform) -->
        <tr>
          <td>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td width="25%"><a href="{instagram}"><img src="{iconUrl}" alt="Instagram" width="32" height="32" style="display: block; border: 0;"></a></td>
                <td width="25%"><a href="{facebook}"><img src="{iconUrl}" alt="Facebook" width="32" height="32" style="display: block; border: 0;"></a></td>
                <td width="25%"><a href="{tiktok}"><img src="{iconUrl}" alt="TikTok" width="32" height="32" style="display: block; border: 0;"></a></td>
                <td width="25%"><a href="{youtube}"><img src="{iconUrl}" alt="YouTube" width="32" height="32" style="display: block; border: 0;"></a></td>
              </tr>
            </table>
          </td>
        </tr>
        
        <!-- Legal fine print (with Klaviyo merge tags) -->
        <tr>
          <td style="padding: 24px; text-align: center; font-size: 11px; color: #888888;">
            {{ organization.name }}<br>
            {{ organization.address }}<br><br>
            <a href="{% unsubscribe_link %}" style="color: #888888;">Unsubscribe</a> |
            <a href="{% manage_preferences_link %}" style="color: #888888;">Manage Preferences</a><br>
            © 2024 All rights reserved.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

### Vision Diff Convergence

**Library:** `src/lib/footerVisionDiff.ts`

**Process:**
1. Render generated HTML to PNG screenshot
2. Call Google Vision API on both (reference + rendered)
3. Extract layout features (object positions, text blocks)
4. Compare coordinates:
   - Logo position (x, y)
   - Social icons spacing/alignment
   - Legal text alignment
5. Compute offset deltas
6. If any delta > tolerance:
   - Pass diffs to refine-footer-html
   - Claude adjusts HTML (padding, widths, colors)
   - Iterate (max 5 loops)
7. When convergence achieved, save HTML

### Critical Rules

1. **Width MUST be 600px:**
   - `<table width="600" style="width: 600px; max-width: 600px;">`
   - Outer wrapper is 100%, inner is exactly 600
2. **Table-only layout:**
   - No divs, flexbox, grid, floats
   - All layout via `<table>`, `<td>`, nested tables
3. **Inline styles:**
   - No `<style>` blocks or external CSS
   - Every style on the element
4. **Klaviyo merge tags (CRITICAL):**
   - `{% unsubscribe_link %}` — inside href
   - `{% manage_preferences_link %}` — inside href
   - `{{ organization.name }}` — in text
   - `{{ organization.address }}` — in text
   - NEVER use `{% unsubscribe_url %}` (doesn't exist)
   - NEVER wrap `{% unsubscribe %}` in `<a href="">` (renders nested `<a>` tags)
5. **Logo must be image:**
   - Use `<img src="{logoUrl}">`, NOT text
   - Select light logo for dark backgrounds, dark logo for light backgrounds
6. **Social icons must link:**
   - Each icon is a separate column
   - Each column has `<a href="{platform_url}">` with icon `<img>`
   - Use real platform URLs, not placeholder text

---

## 6. KLAVIYO PUSH-TO-TEMPLATE FLOW

**File:** `supabase/functions/push-to-klaviyo/index.ts` (524 lines)

### Process

**Input:**
```typescript
{
  templateName: string           // "Summer Sale Email"
  slices: SliceData[]            // Campaign slices with links
  footerHtml: string             // Reusable footer HTML
  klaviyoApiKey: string          // Brand's Klaviyo key
  mode: 'template' | 'campaign'  // Template-only or full campaign
  
  // If mode = 'campaign'
  listId: string                 // Primary Klaviyo list (segment)
  includedSegments: string[]     // Additional segments to include
  excludedSegments: string[]     // Segments to exclude
  subjectLine: string            // Email subject
  previewText: string            // Preview text
}
```

**Output (mode='template'):**
```typescript
{
  success: true,
  templateId: string,
  message: "Template created successfully"
}
```

**Output (mode='campaign'):**
```typescript
{
  success: true,
  templateId: string,
  campaignId: string,
  campaignUrl: string            // Link to Klaviyo UI
}
```

### HTML Assembly

**Single-image (legacy):**
```html
<tr>
  <td data-klaviyo-region="true">
    <img src="{imageUrl}" alt="..." />
  </td>
</tr>
```

**Multi-slice (new):**
```html
<tr>
  <td data-klaviyo-region="true">
    <img src="{slice1.imageUrl}" alt="{slice1.altText}" />
  </td>
</tr>
<tr>
  <td data-klaviyo-region="true">
    <img src="{slice2.imageUrl}" alt="{slice2.altText}" />
  </td>
</tr>
<!-- etc. -->
```

**With multi-column slice:**
```html
<tr>
  <td align="center" style="padding: 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td width="50%" data-klaviyo-region="true">
          <a href="{col1.link}">
            <img src="{col1.imageUrl}" width="300" alt="{col1.altText}" />
          </a>
        </td>
        <td width="50%" data-klaviyo-region="true">
          <a href="{col2.link}">
            <img src="{col2.imageUrl}" width="300" alt="{col2.altText}" />
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>
```

**Footer always appended:**
```html
<!-- {footerHtml} -->
```

### Full Template Wrapper

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{templateName}</title>
  <!-- Dark mode CSS (optional) -->
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .darkmode-text { color: #ffffff !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0">
          <!-- SLICES -->
          {imageContent}
          <!-- FOOTER -->
          {footerSection}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Klaviyo API Calls

**Create Template:**
```
POST https://a.klaviyo.com/api/templates
Authorization: Klaviyo-API-Key {key}
Revision: 2025-01-15
Content-Type: application/json

{
  "data": {
    "type": "template",
    "attributes": {
      "name": "{templateName}",
      "editor_type": "USER_DRAGGABLE",
      "html": "{fullHtmlAbove}"
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "id": "01aq4zz7jk...",
    ...
  }
}
```

**Create Campaign (if mode='campaign'):**
```
POST https://a.klaviyo.com/api/campaigns
Authorization: Klaviyo-API-Key {key}
Revision: 2025-10-15
Content-Type: application/vnd.api+json
Accept: application/vnd.api+json

{
  "data": {
    "type": "campaign",
    "attributes": {
      "name": "{templateName}",
      "audiences": {
        "included": ["{listId}", ...{includedSegments}],
        "excluded": [{excludedSegments}]
      },
      "send_strategy": {
        "method": "immediate"
      },
      "send_options": {
        "use_smart_sending": true
      },
      "campaign-messages": {
        "data": [
          {
            "type": "campaign-message",
            "attributes": {
              "definition": {
                "channel": "email",
                "label": "{templateName}",
                "content": {
                  "subject": "{subjectLine}",
                  "preview_text": "{previewText}"
                }
              }
            }
          }
        ]
      }
    }
  }
}
```

### Multi-Column Rules

- **Two clickable elements in same slice = INVALID**
  - Must split into separate columns
  - Each column gets own `data-klaviyo-region="true"`
- **Nested tables required:**
  - Outer: 100% width, center-aligned
  - Inner: 600px width (email standard)
  - Column cells: percentages (50%, 33.33%, 25%, etc.)
- **Each column independently editable:**
  - Klaviyo treats each `data-klaviyo-region` as a separate editable block

---

## 7. SECURITY & QUALITY ISSUES

### Critical Security Issues

#### 1. **All Edge Functions Have verify_jwt = false**
**File:** `/Users/jackstringer/design-to-email-flow/supabase/config.toml`  
**Status:** ALL 53 functions are public (no JWT verification at Supabase level)

**Impact:**
- Any caller can invoke any function (e.g., `push-to-klaviyo`, `process-campaign-queue`)
- Auth delegated entirely to RLS + manual token checks in function code
- Risk: If a function forgets to check auth, it's exposed

**Mitigation:**
- Each function manually validates brand ownership via `user_id` checks
- Plugin token required for figma-ingest
- Most functions check brand.user_id matches caller
- But if a function is overlooked, it's public

**Recommendation:** Enable `verify_jwt = true` on all functions, then extract JWT inside function. This provides defense-in-depth.

#### 2. **Plaintext Secrets in Database**
**File:** `src/integrations/supabase/types.ts` — brands table
```typescript
{
  klaviyo_api_key: string | null        // Stored plaintext
  clickup_api_key: string | null        // Stored plaintext
}
```

**Impact:**
- Secrets stored as plaintext in Postgres
- Anyone with database access (including Supabase backups) can read them
- No encryption at rest

**Risk Level:** HIGH — API keys can be used to:
- Create/delete Klaviyo campaigns in user's account
- Modify ClickUp tasks
- Enumerate brand catalog

**Recommendation:** 
- Use Vault API (Supabase Vault) or AWS Secrets Manager for encryption
- Store only encrypted reference IDs in database
- Decrypt secrets in edge functions on-demand

#### 3. **Cross-User Brand Access Not Validated in All Paths**
**Example:** `get-brand-link-index` endpoint probably needs `brand.user_id = auth.uid()` check but let me verify...

**Status:** Most functions appear to check, but the `verify_jwt = false` + manual auth pattern is fragile.

**Recommendation:** 
- Implement standard auth middleware in Deno
- Extract auth once, attach to request context
- Validate all brand operations against user

#### 4. **Firecrawl/Crawl Functions May Expose Secrets**
**Files:** `crawl-brand-site`, `detect-footer-links`, `import-sitemap`
- These functions call Firecrawl API
- If error occurs and error message is logged/returned, API key might leak
- **Current:** Error handling appears safe (keys in headers, not in URLs)

#### 5. **Cloudinary Secrets in Signed Uploads**
**File:** `invert-logo/index.ts` (line shows `CLOUDINARY_API_SECRET`)
- Used for signing upload requests
- If exposed, attacker can forge Cloudinary uploads

#### 6. **No Rate Limiting on Edge Functions**
**Impact:** 
- Abuse scenario: Attacker invokes `process-campaign-queue` 100x in parallel
- Expensive Claude + Vision calls can incur large costs
- No per-user quota enforcement

**Recommendation:**
- Implement rate limiting in edge functions
- Use `campaign_queue.user_id` to track per-user call counts
- Reject if exceeding threshold (e.g., 5 campaigns/minute)

#### 7. **Plugin Tokens Not Revoked Easily**
**File:** `plugin_tokens` table
- Tokens are long random strings
- No built-in revocation mechanism (only `delete` from table)
- Lost plugin install has no rate limit on token guessing

#### 8. **Supabase Publishable Key Exposed in .env**
**File:** `.env`
```
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_SUPABASE_URL="https://..."
```
**Status:** This is intentional (Supabase public key for client-side auth)
**Safe?** Yes — public key cannot write data (RLS enforces it)
**But:** Entire auth.users table and profiles are readable by anyone with JWT (fine for single-tenant, risky for multi-tenant)

### Code Quality Issues

#### 1. **Image Handling: Chunked Base64 is Verbose**
**File:** `process-campaign-queue/index.ts` (lines 114–119)
```typescript
const CHUNK_SIZE = 32768
let binary = ''
for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
  const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length))
  binary += String.fromCharCode(...chunk)
}
const base64 = btoa(binary)
```
**Issue:** Safe but verbose. Could use `Buffer.from().toString('base64')` in Node (not Deno).
**Status:** Correct for Deno environment ✓

#### 2. **Error Messages May Leak Context**
**Example:** `analyze-slices` function returns full Claude error if API call fails
```typescript
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  return new Response(JSON.stringify({ error: message }), { status: 500, ... })
}
```
**Risk:** Claude API errors might include prompt content or system message hints
**Recommendation:** Sanitize error messages; log full details server-side only

#### 3. **No Idempotency Keys on Expensive Operations**
**Example:** `push-to-klaviyo` — if called twice with same data, creates duplicate template
**Impact:** Accidental double-push creates two Klaviyo templates
**Recommendation:** Require `idempotency-key` header; store results by key

#### 4. **Campaign Queue Polling has No Timeout**
**File:** `process-campaign-queue/index.ts` — Step 5 (poll early_generated_copy)
```typescript
// Poll (max 12s, 6 attempts)
for (let i = 0; i < 6; i++) {
  const result = await supabase.from('early_generated_copy').select(...).single()
  if (result.data) break
  await delay(2000)
}
```
**Status:** OK — 12s timeout is reasonable
**But:** If early generation crashes, queue waits full 12s then falls back to sync generation
**Recommendation:** Add heartbeat check or `status` field to early_generated_copy

#### 5. **No Transactional Updates**
**Example:** If `process-campaign-queue` crashes after updating slices but before updating status, queue entry is stuck in partial state
**Recommendation:** Use Postgres transactions or implement idempotent replay logic

#### 6. **Vector Search Has No Fallback**
**File:** `match-slice-to-link/index.ts` (line 182–189)
- If `embed_search_bnn` function fails, entire match fails
- Returns `no_match`, caller retries via Firecrawl (slow)
**Recommendation:** Fallback to simple list matching if vector search unavailable

#### 7. **HTML Email Rules Are Duplicated**
**Files:** `generate-slice-html/index.ts`, `generate-footer-html/index.ts`
- Both define EMAIL_FOOTER_RULES or similar constants
- Changes must be made in multiple places
**Recommendation:** Extract to shared module/constant

#### 8. **Claude Model Hardcoding**
**Examples:**
- `analyze-slices`: uses `claude-sonnet-4-5`
- `generate-footer-html`: uses `claude-opus-4-8`
- `match-slice-to-link`: uses `claude-haiku` for small catalogs
**Status:** OK for optimization, but brittle if models sunset
**Recommendation:** Add model name to brand preferences + config.ts

#### 9. **No Webhook Delivery Confirmation**
**Process:** figma-ingest fires `process-campaign-queue` async (no wait)
**Risk:** If process-campaign-queue never runs, user never notified
**Recommendation:** Implement webhook delivery + retry (or use Supabase queues)

#### 10. **Link Verification Never Expires**
**File:** `brand_link_index` table
- `last_verified_at` tracked but never used to re-verify
- Stale links can remain marked as `is_healthy: true` forever
**Recommendation:** `weekly-link-recrawl` should update `last_verified_at`

---

## 8. WHAT'S WORTH KEEPING vs REWRITING

### ✅ KEEP: The Slicing Algorithm (auto-slice-v2)

**Why:**
- **Proven two-tier architecture:** Vision data gathering + Claude decision making is sound
- **Excellent prompt engineering:** Detailed, unambiguous instructions for horizontal splits, button separation, footer detection
- **Guardrails:** Footer <55% detection prevents common false positives
- **Scalable:** Works for both email campaigns and standalone footers (with mode flag)
- **Coordinate scaling:** Handles image resizing elegantly via `scaleFactor`

**Recommendation:** Port to new backend as-is. Only tweak:
- Update model names if Claude versions change
- Add per-brand model selection (Sonnet vs Opus)
- Consider adding `explainability` mode (return Claude reasoning)

---

### ✅ KEEP: The Process-Campaign-Queue Orchestrator

**Why:**
- **Well-structured pipeline:** Each step clearly demarcated, progress tracked
- **Smart parallelization:** Early generation async, Vision API 3-parallel calls, slice uploads batched
- **Observability:** Logs every step with timing, coordinates scaled properly
- **Error handling:** Retry logic, graceful fallbacks (e.g., early generation timeout → sync fallback)
- **CDN-friendly:** Uses URL transformations (Cloudinary/ImageKit) instead of in-memory decoding

**Recommendation:** Keep pattern but:
- Add transactional guarantees (use Postgres transactions)
- Implement webhook delivery confirmation
- Add structured logging (JSON events, trace IDs)
- Make model selection configurable

---

### ✅ KEEP: Footer Vision-Diff Loop

**Why:**
- **Convergence strategy is solid:** Render HTML, diff vs reference, iterate until tolerance
- **Pragmatic:** Uses Google Vision API for layout analysis (fast, cheap)
- **Bounded:** Max 5 iterations prevents infinite loops

**Recommendation:** Port as-is, but:
- Add tolerance config (currently hardcoded)
- Log each iteration's diffs for debugging
- Cache rendered screenshots (avoid re-rendering same HTML)

---

### ✅ KEEP: Klaviyo HTML Assembly

**Why:**
- **Battle-tested multi-column logic:** Nested tables for side-by-side slices work perfectly
- **Proper region marking:** `data-klaviyo-region="true"` on each editable block
- **Dark mode support:** CSS `@media (prefers-color-scheme: dark)`
- **Flexible:** Supports single image, multi-slice, mixed HTML+image content

**Recommendation:** Keep, but:
- Add validation: Ensure no two clickable elements in same region
- Test with actual Klaviyo rendering (pixel-perfect verification)
- Document Klaviyo API version being used (currently 2025-01-15 for templates, 2025-10-15 for campaigns)

---

### ✅ KEEP: Link Intelligence Architecture

**Why:**
- **Two-tier discovery:** Brand link index (fast) + Firecrawl (comprehensive)
- **Learning system:** brands.all_links caches findings, reduces redundant searches
- **Vector RAG:** pgvector embeddings enable semantic search (not just keyword matching)
- **Fallback chain:** Brand rules → index match → default URL → web search

**Recommendation:** Port as-is, but:
- Migrate to OpenAI embeddings API v3-small (better, cheaper)
- Implement link health checks (HTTP 200 verification with timeout)
- Add rate limiting on Firecrawl calls (expensive API)

---

### ⚠️ REWRITE: Edge Function Auth Pattern

**Current:** `verify_jwt = false` on all functions + manual JWT parsing in each function
```typescript
// In push-to-klaviyo:
const authHeader = req.headers.get('Authorization')
const token = authHeader.replace('Bearer ', '')
const payload = JSON.parse(atob(token.split('.')[1]))
const userId = payload.sub
```

**Problems:**
- Fragile (manual JWT parsing in every function)
- Inconsistent (some functions check, some don't)
- No standard middleware

**Recommendation:** Implement auth middleware:
```typescript
// Shared auth.ts utility
function extractUserFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub
  } catch {
    return null
  }
}

// In each function:
const userId = extractUserFromRequest(req)
if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
```

---

### ⚠️ REWRITE: Secret Management

**Current:** Plaintext storage in database
```typescript
brands.klaviyo_api_key = "pk_live_..." // Plaintext
```

**Recommended:** Supabase Vault or external secrets manager
```typescript
// In edge function, decrypt from vault
const decryptedKey = await vault.decrypt(brand.encrypted_key_id, userId)

// Or AWS Secrets Manager
const secret = await secretsManager.getSecret(`brands/${brandId}/klaviyo-key`)
```

---

### ⚠️ REWRITE: Rate Limiting & Quotas

**Current:** None

**Recommendation:** Per-user quotas in edge function:
```typescript
// Before processing campaign:
const { count } = await supabase
  .from('campaign_queue')
  .select('id', { count: 'exact' })
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute

if (count >= 5) {
  return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 })
}
```

---

### ⚠️ REWRITE: Error Handling & Logging

**Current:** Mixed console.log + inline error responses

**Recommendation:** Structured logging + error tracking:
```typescript
// Structured log entry
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  traceId: req.headers.get('x-trace-id'),
  function: 'process-campaign-queue',
  step: 'auto-slice',
  duration: autoSliceMs,
  sliceCount: slices.length
}))

// Error tracking (Sentry/DataDog)
if (error) {
  captureException(error, {
    tags: { function: 'process-campaign-queue', step: 'auto-slice' },
    extra: { campaignId, sliceCount }
  })
}
```

---

### ⚠️ REWRITE: Async Job Orchestration

**Current:** Fire-and-forget via fetch, no confirmation
```typescript
fetch(earlyGenUrl, { ... }).catch(err => console.log('ok'))
```

**Recommendation:** Use Supabase queues or Temporal:
```typescript
// Insert into processing_jobs table with status='pending'
// Separate worker polls and executes jobs
// Guarantees delivery + retry on failure
```

---

### ✅ KEEP: Frontend Routes & Components

**Why:**
- **Well-organized:** Pages per route, components granular
- **Modern stack:** React Router v6, TanStack Query, Zod validation
- **Responsive:** Tailwind + shadcn/ui ensure mobile/tablet support
- **Realtime:** Supabase subscriptions for live queue updates

**Recommendation:** Keep as-is; add:
- TypeScript strict mode
- Error boundary components
- Loading skeleton components

---

## 9. RECOMMENDATIONS FOR REBUILD

### Short Term (MVP Quality)

1. **Enable JWT verification:** `verify_jwt = true` in config.toml
2. **Encrypt secrets:** Use Supabase Vault for Klaviyo/ClickUp keys
3. **Add rate limiting:** Per-user function call quotas
4. **Structured logging:** JSON-formatted logs with trace IDs
5. **Idempotency:** Support `idempotency-key` header on `push-to-klaviyo`

### Medium Term (Production Quality)

1. **Webhook delivery:** Confirm campaign_queue processing completion
2. **Health checks:** Periodic link verification + stale URL detection
3. **Model versioning:** Move model names to config, allow per-brand overrides
4. **Error tracking:** Integrate Sentry/DataDog for error aggregation
5. **Database transactions:** Wrap multi-step operations in transactions

### Long Term (Mature System)

1. **Temporal/durable-js:** Replace fire-and-forget with reliable async task execution
2. **Caching layer:** Redis for link index, early generation results
3. **Cost tracking:** Monitor Claude/Vision API spend per brand
4. **Admin dashboard:** Visibility into queue, link health, error trends
5. **Webhook marketplace:** Allow integrations (Shopify, Zapier, etc.)

---

## FINAL SUMMARY

| Aspect | Rating | Comment |
|--------|--------|---------|
| **Architecture** | ⭐⭐⭐⭐ | Clean separation (Vision → Claude → HTML). Excellent orchestration pattern. |
| **Algorithm (Slicing)** | ⭐⭐⭐⭐ | Proven two-tier approach. Detailed prompts. Smart guardrails. |
| **Prompts** | ⭐⭐⭐⭐⭐ | Battle-tested. Specific rules for horizontalsplits, button separation, footer detection. |
| **Image Handling** | ⭐⭐⭐⭐ | CDN transforms, chunked base64, MIME type detection. Solid. |
| **HTML Generation** | ⭐⭐⭐⭐ | Table-based, Klaviyo-compatible, multi-column support, vision diff loop. |
| **State Management** | ⭐⭐⭐ | Works but not transactional. Partial failures possible. |
| **Security** | ⭐⭐ | No verify_jwt, plaintext secrets, no rate limits. Needs hardening. |
| **Error Handling** | ⭐⭐⭐ | Graceful fallbacks but error messages may leak context. |
| **Testing** | ⭐ | No visible test suite. Recommend playwright tests. |
| **Observability** | ⭐⭐⭐ | Console logs are helpful but unstructured. No trace IDs. |
| **Scalability** | ⭐⭐⭐ | Parallelized where sensible. No rate limits = potential abuse vector. |

**Bottom Line:** The **slicing algorithm, orchestration pattern, and HTML assembly are production-grade and worth porting.** The **security and reliability layers need hardening** (encryption, transactions, logging). **Frontend is solid.**

---

## FILES REFERENCED

### Critical Edge Functions
- `/Users/jackstringer/design-to-email-flow/supabase/functions/auto-slice-v2/index.ts` (2031 lines)
- `/Users/jackstringer/design-to-email-flow/supabase/functions/process-campaign-queue/index.ts` (1505 lines)
- `/Users/jackstringer/design-to-email-flow/supabase/functions/push-to-klaviyo/index.ts` (524 lines)
- `/Users/jackstringer/design-to-email-flow/supabase/functions/generate-slice-html/index.ts` (474 lines)
- `/Users/jackstringer/design-to-email-flow/supabase/functions/generate-footer-html/index.ts` (432 lines)
- `/Users/jackstringer/design-to-email-flow/supabase/functions/analyze-slices/index.ts` (651 lines)

### Configuration
- `/Users/jackstringer/design-to-email-flow/supabase/config.toml` (164 lines, 51 functions)
- `/Users/jackstringer/design-to-email-flow/.env` (3 lines, public keys only)

### Database
- `/Users/jackstringer/design-to-email-flow/src/integrations/supabase/types.ts` (auto-generated, 950+ lines)

### Frontend
- `/Users/jackstringer/design-to-email-flow/src/pages/CampaignQueue.tsx` (18.7 KB)
- `/Users/jackstringer/design-to-email-flow/src/pages/CampaignSend.tsx` (50.3 KB)
- `/Users/jackstringer/design-to-email-flow/src/pages/ImageFooterStudio.tsx` (27 KB)

### Documentation
- `/Users/jackstringer/design-to-email-flow/ARCHITECTURE_OVERVIEW.md` (291 lines)
- `/Users/jackstringer/design-to-email-flow/TECHNICAL_ARCHITECTURE.md` (846 lines)

---

*Report generated: June 10, 2026. Full audit of 51 edge functions, database schema (15+ tables), frontend routes, and security posture.*