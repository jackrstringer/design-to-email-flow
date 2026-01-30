// Link preferences stored in brands.link_preferences JSONB
export interface BrandLinkPreferences {
  // Core preference - REQUIRED during onboarding
  default_cta_behavior: 'homepage' | 'primary_collection' | 'campaign_context';
  
  // If default_cta_behavior is 'primary_collection' or as a fallback
  primary_collection_name?: string;
  primary_collection_url?: string;
  
  // Catalog characteristics (affects matching strategy)
  catalog_size?: 'small' | 'medium' | 'large';  // <50, 50-500, 500+
  product_churn?: 'low' | 'medium' | 'high';    // rarely, monthly, weekly+
  
  // Import tracking
  sitemap_url?: string;
  last_sitemap_import_at?: string;
  
  // Onboarding
  onboarding_completed_at?: string;
}

// Link index entry from brand_link_index table
export interface BrandLinkIndexEntry {
  id: string;
  brand_id: string;
  url: string;
  link_type: 'homepage' | 'collection' | 'product' | 'page';
  title: string | null;
  description: string | null;
  parent_collection_url: string | null;
  last_verified_at: string | null;
  is_healthy: boolean;
  verification_failures: number;
  last_used_at: string | null;
  use_count: number;
  source: 'sitemap' | 'crawl' | 'ai_discovered' | 'user_added';
  user_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

// Sitemap import job from sitemap_import_jobs table
export interface SitemapImportJob {
  id: string;
  brand_id: string;
  sitemap_url: string;
  status: 'pending' | 'parsing' | 'fetching_titles' | 'generating_embeddings' | 'complete' | 'failed';
  urls_found: number;
  urls_processed: number;
  urls_failed: number;
  product_urls_count: number;
  collection_urls_count: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// API response types
export interface GetBrandLinkIndexResponse {
  links: BrandLinkIndexEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TriggerSitemapImportResponse {
  job: SitemapImportJob;
}

export type LinkFilter = 'all' | 'products' | 'collections' | 'unhealthy';
