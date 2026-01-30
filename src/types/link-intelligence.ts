// Conditional routing rule
export interface LinkRoutingRule {
  id: string;           // UUID for React keys and deletion
  name: string;         // User's label: "Protein campaigns"
  keywords: string[];   // Triggers: ["protein", "whey", "mass gainer"]
  destination_url: string;
}

// Link preferences stored in brands.link_preferences JSONB
export interface BrandLinkPreferences {
  // Default destination for generic CTAs when no rule matches
  default_destination_url?: string;
  default_destination_name?: string;  // Optional friendly label
  
  // Conditional rules - checked in order, first match wins
  rules?: LinkRoutingRule[];
  
  // Catalog characteristics (keep these)
  catalog_size?: 'small' | 'medium' | 'large';
  product_churn?: 'low' | 'medium' | 'high';
  
  // Import tracking (keep these)
  sitemap_url?: string;
  last_sitemap_import_at?: string;
  
  // Legacy fields (for migration compatibility)
  default_cta_behavior?: 'homepage' | 'primary_collection' | 'campaign_context';
  primary_collection_name?: string;
  primary_collection_url?: string;
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

// Helper function for matching rules against campaign content
export function findDestinationUrl(
  campaignContent: string, 
  preferences: BrandLinkPreferences
): string | null {
  const contentLower = campaignContent.toLowerCase();
  
  // Check rules in order - first match wins
  for (const rule of (preferences.rules || [])) {
    const hasMatch = rule.keywords.some(keyword => 
      contentLower.includes(keyword.toLowerCase())
    );
    if (hasMatch) {
      return rule.destination_url;
    }
  }
  
  // Fall back to default destination
  return preferences.default_destination_url || null;
}
