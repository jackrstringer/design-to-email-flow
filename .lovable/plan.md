
# Link Intelligence System - Chunk 1 Implementation Plan

## Overview
This plan covers the foundational infrastructure for a pre-indexed product URL system that enables instant link matching for email campaigns instead of slow per-campaign web searches.

---

## Phase 1: Database Schema & Migrations

### 1.1 Enable pgvector Extension
```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

### 1.2 Create `brand_link_index` Table
Stores indexed URLs with embeddings for semantic search.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| brand_id | UUID | Foreign key to brands |
| url | TEXT | Full URL |
| link_type | TEXT | 'homepage', 'collection', 'product', 'page' |
| title | TEXT | Page title |
| description | TEXT | Optional description |
| embedding | VECTOR(1536) | OpenAI embedding for semantic search |
| parent_collection_url | TEXT | Parent collection (if product) |
| last_verified_at | TIMESTAMPTZ | Health check timestamp |
| is_healthy | BOOLEAN | Link validity status |
| verification_failures | INTEGER | Failed health check count |
| last_used_at | TIMESTAMPTZ | Usage tracking |
| use_count | INTEGER | Match count |
| source | TEXT | 'sitemap', 'crawl', 'ai_discovered', 'user_added' |
| user_confirmed | BOOLEAN | Manual confirmation flag |
| created_at / updated_at | TIMESTAMPTZ | Timestamps |

Indexes: `brand_id`, `(brand_id, is_healthy)`, `(brand_id, link_type)`
Unique constraint: `(brand_id, url)`

### 1.3 Create `sitemap_import_jobs` Table
Tracks async sitemap import progress.

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| brand_id | UUID | Foreign key to brands |
| sitemap_url | TEXT | Import source |
| status | TEXT | 'pending', 'parsing', 'fetching_titles', 'generating_embeddings', 'complete', 'failed' |
| urls_found | INTEGER | Total URLs discovered |
| urls_processed | INTEGER | Progress counter |
| urls_failed | INTEGER | Error counter |
| product_urls_count | INTEGER | Final product count |
| collection_urls_count | INTEGER | Final collection count |
| started_at / completed_at | TIMESTAMPTZ | Timing |
| error_message | TEXT | Failure reason |

### 1.4 Add `link_preferences` to `brands` Table
```sql
ALTER TABLE brands ADD COLUMN IF NOT EXISTS link_preferences JSONB DEFAULT '{}'::jsonb;
```

TypeScript interface:
```typescript
interface BrandLinkPreferences {
  default_cta_behavior: 'homepage' | 'primary_collection' | 'campaign_context';
  primary_collection_name?: string;
  primary_collection_url?: string;
  catalog_size: 'small' | 'medium' | 'large';
  product_churn: 'low' | 'medium' | 'high';
  sitemap_url?: string;
  last_sitemap_import_at?: string;
  onboarding_completed_at?: string;
}
```

### 1.5 RLS Policies
- Users can CRUD their own brand's link index entries
- Users can view/manage their own import jobs
- Service role access for edge functions

---

## Phase 2: Add OpenAI API Key Secret

**Important**: The project currently lacks an `OPENAI_API_KEY` secret. Before implementing embedding generation, this secret must be added via the secrets management tool.

---

## Phase 3: Edge Functions

### 3.1 `generate-embedding` Function
Generates embeddings via OpenAI's text-embedding-3-small model.

```typescript
// Input
{ texts: string[] }  // Up to 100 texts per call

// Output
{ embeddings: number[][] }  // Array of 1536-dimension vectors
```

Implementation:
- Uses OpenAI SDK for Deno
- Batches texts (max 100 per API call)
- Returns embeddings in same order as input

### 3.2 `trigger-sitemap-import` Function
Initiates an async sitemap import.

```typescript
// Input
{ brand_id: string; sitemap_url: string }

// Output
{ job: SitemapImportJob }  // Immediately returns job record for polling
```

Implementation:
- Validates no existing running import for brand
- Creates job record with status 'pending'
- Updates brand.link_preferences.sitemap_url
- Fires async call to `import-sitemap` (non-blocking)
- Returns job immediately so UI can poll

### 3.3 `import-sitemap` Function (Background Task)
Parses sitemap and indexes URLs.

Process flow:
1. Update job status to 'parsing'
2. Fetch sitemap XML, handle sitemap index (recursive)
3. Extract URLs, categorize by pattern:
   - `/products/` → product
   - `/collections/` → collection
   - Skip: /cart, /account, /policies, /pages/faq, etc.
4. Update job: urls_found, status = 'fetching_titles'
5. Batch fetch page titles (20 concurrent, with timeout)
6. Update job: status = 'generating_embeddings'
7. Generate embeddings in batches of 100
8. Bulk upsert into brand_link_index
9. Update job: status = 'complete', final counts

Error handling:
- Catch all errors, update job status to 'failed' with message
- Continue on individual URL failures, track in urls_failed

### 3.4 `add-brand-link` Function
Manually add a single link.

```typescript
// Input
{ brand_id: string; url: string; title: string; link_type: 'product' | 'collection' | 'page' }

// Output
{ link: BrandLinkIndexEntry }
```

Implementation:
- Normalize URL (prepend domain if relative)
- Generate embedding for title
- Insert with source: 'user_added', user_confirmed: true

### 3.5 `delete-brand-link` Function
Remove a link from the index.

```typescript
// Input
{ link_id: string }

// Output
{ success: boolean }
```

### 3.6 `get-brand-link-index` Function
Paginated link retrieval with filters.

```typescript
// Input
{ 
  brand_id: string;
  page?: number;
  limit?: number;
  filter?: 'all' | 'products' | 'collections' | 'unhealthy';
  search?: string;
}

// Output
{ 
  links: BrandLinkIndexEntry[];
  total: number;
  page: number;
  totalPages: number;
}
```

### 3.7 `update-brand-link-preferences` Function
Update the preferences JSON.

```typescript
// Input
{ brand_id: string; preferences: Partial<BrandLinkPreferences> }

// Output
{ preferences: BrandLinkPreferences }
```

---

## Phase 4: Frontend - Brand Onboarding Flow

Extend `BrandOnboardingModal.tsx` to add link preferences steps after the current ClickUp step.

### 4.1 New Step: Link Preferences
Insert between ClickUp and Footer steps.

**Screen 1: Default Link Behavior**
- Title: "Link Preferences"
- Radio options:
  - "Always to homepage"
  - "To a primary collection" (shows collection name/URL inputs)
  - "Depends on the campaign"

**Screen 2: Catalog Information**
- Catalog size: Small / Medium / Large
- Product churn: Rarely / Sometimes / Frequently

**Screen 3: Import Product Links**
- Options:
  - Import from URL (text input)
  - Try default ({domain}/sitemap.xml)
  - Skip for now
- Note about background processing

### 4.2 State Management
Add new state variables:
```typescript
const [linkPreferences, setLinkPreferences] = useState<BrandLinkPreferences>({
  default_cta_behavior: 'campaign_context',
  catalog_size: 'medium',
  product_churn: 'medium',
});
const [sitemapUrl, setSitemapUrl] = useState('');
const [importChoice, setImportChoice] = useState<'url' | 'default' | 'skip'>('default');
```

### 4.3 On Complete
- Save link_preferences to brand
- If import selected, call trigger-sitemap-import

---

## Phase 5: Frontend - Brand Detail Page Components

### 5.1 New File: `src/components/brand/LinkIntelligenceSection.tsx`
Main container for link index UI on brand detail page.

Features:
- Stats bar: Total links, Products, Collections, Healthy count
- Import status card (shows when job running or recently completed)
- Link table with pagination
- Add Link button/modal
- Filter dropdown and search

### 5.2 New File: `src/components/brand/SitemapImportCard.tsx`
Progress visualization during imports.

Features:
- Status message based on job.status
- Progress bar: urls_processed / urls_found
- Counts: products, collections found
- Retry button on failure

### 5.3 New File: `src/components/brand/BrandLinkTable.tsx`
Paginated table of indexed links.

Columns:
- Title (truncated)
- URL (truncated, external link icon)
- Type (badge)
- Health (icon)
- Last Used (relative time)
- Actions (delete button)

### 5.4 New File: `src/components/brand/AddLinkModal.tsx`
Modal for manually adding links.

Fields:
- Title (text input)
- URL (text input with domain validation)
- Type (dropdown: Product / Collection / Page)

### 5.5 New File: `src/components/brand/LinkPreferencesCard.tsx`
Displays and allows editing of link preferences.

Shows:
- Default CTA behavior
- Primary collection (if applicable)
- Catalog size & product churn
- Edit button opens modal with same fields as onboarding

### 5.6 Update `BrandSettings.tsx`
Add new collapsible section "Link Intelligence" after existing sections.

```typescript
// Add to openSections state
linkIntelligence: false,

// Add collapsible section
<Collapsible open={openSections.linkIntelligence} onOpenChange={() => toggleSection('linkIntelligence')}>
  <CollapsibleTrigger>Link Intelligence</CollapsibleTrigger>
  <CollapsibleContent>
    <LinkIntelligenceSection brandId={brand.id} domain={brand.domain} />
  </CollapsibleContent>
</Collapsible>
```

---

## Phase 6: Hooks & Data Fetching

### 6.1 New File: `src/hooks/useBrandLinkIndex.ts`
React Query hook for link index operations.

```typescript
export function useBrandLinkIndex(brandId: string) {
  // Query: fetch paginated links
  // Mutations: add link, delete link
  // Query: fetch import job status (polls while running)
}
```

### 6.2 New File: `src/hooks/useSitemapImport.ts`
Hook for import operations with polling.

```typescript
export function useSitemapImport(brandId: string) {
  // Query: latest job status (refetch every 3s while running)
  // Mutation: trigger new import
}
```

---

## Phase 7: Type Definitions

### 7.1 Update `src/types/brand-assets.ts`
Add new interfaces:

```typescript
export interface BrandLinkPreferences {
  default_cta_behavior: 'homepage' | 'primary_collection' | 'campaign_context';
  primary_collection_name?: string;
  primary_collection_url?: string;
  catalog_size: 'small' | 'medium' | 'large';
  product_churn: 'low' | 'medium' | 'high';
  sitemap_url?: string;
  last_sitemap_import_at?: string;
  onboarding_completed_at?: string;
}

export interface BrandLinkIndexEntry {
  id: string;
  brandId: string;
  url: string;
  linkType: 'homepage' | 'collection' | 'product' | 'page';
  title: string | null;
  description: string | null;
  parentCollectionUrl: string | null;
  lastVerifiedAt: string | null;
  isHealthy: boolean;
  verificationFailures: number;
  lastUsedAt: string | null;
  useCount: number;
  source: 'sitemap' | 'crawl' | 'ai_discovered' | 'user_added';
  userConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SitemapImportJob {
  id: string;
  brandId: string;
  sitemapUrl: string;
  status: 'pending' | 'parsing' | 'fetching_titles' | 'generating_embeddings' | 'complete' | 'failed';
  urlsFound: number;
  urlsProcessed: number;
  urlsFailed: number;
  productUrlsCount: number;
  collectionUrlsCount: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 Update `Brand` interface
Add `linkPreferences?: BrandLinkPreferences;`

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/xxx_link_intelligence.sql` | Database schema |
| `supabase/functions/generate-embedding/index.ts` | OpenAI embeddings |
| `supabase/functions/trigger-sitemap-import/index.ts` | Start import job |
| `supabase/functions/import-sitemap/index.ts` | Background import |
| `supabase/functions/add-brand-link/index.ts` | Manual link add |
| `supabase/functions/delete-brand-link/index.ts` | Remove link |
| `supabase/functions/get-brand-link-index/index.ts` | Paginated retrieval |
| `supabase/functions/update-brand-link-preferences/index.ts` | Update preferences |
| `src/components/brand/LinkIntelligenceSection.tsx` | Main UI container |
| `src/components/brand/SitemapImportCard.tsx` | Import progress |
| `src/components/brand/BrandLinkTable.tsx` | Link table |
| `src/components/brand/AddLinkModal.tsx` | Add link form |
| `src/components/brand/LinkPreferencesCard.tsx` | Preferences display |
| `src/hooks/useBrandLinkIndex.ts` | React Query hook |
| `src/hooks/useSitemapImport.ts` | Import polling hook |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/config.toml` | Add new edge function configs |
| `src/types/brand-assets.ts` | Add new type definitions |
| `src/components/dashboard/BrandSettings.tsx` | Add Link Intelligence section |
| `src/components/dashboard/BrandOnboardingModal.tsx` | Add link preferences steps |
| `src/pages/BrandDetail.tsx` | Parse linkPreferences field |

---

## Prerequisites & Dependencies

1. **OPENAI_API_KEY Secret**: Must be added before implementing generate-embedding function
2. **pgvector Extension**: Required for VECTOR column type

---

## Implementation Order

1. Database migration (creates tables, enables pgvector)
2. Add OpenAI API key secret
3. Edge functions (generate-embedding first, then import pipeline)
4. Type definitions
5. React Query hooks
6. Brand detail page components
7. Onboarding flow extension
8. Integration testing

---

## Technical Notes

### Embedding Strategy
- Using OpenAI's `text-embedding-3-small` (1536 dimensions)
- Batch processing up to 100 texts per API call
- Embeddings stored as VECTOR type for efficient similarity search (future use)

### Sitemap Parsing
- Handle both single sitemaps and sitemap index files
- Use regex patterns to categorize URL types:
  - `/products/` → product
  - `/collections/` → collection
- Skip utility URLs: /cart, /account, /checkout, /policies

### Health Tracking
- `is_healthy` starts true
- Future: periodic verification jobs mark unhealthy after N failures
- Unhealthy links deprioritized in matching

### Progress Polling
- UI polls every 3 seconds while job status is not 'complete' or 'failed'
- Alternative: Supabase Realtime subscription (more complex, not required for v1)
