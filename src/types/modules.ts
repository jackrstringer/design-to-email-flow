export interface ModuleContent {
  headline?: string | null;
  subheadline?: string | null;
  body_copy?: string | null;
  bullet_points?: string[];
  cta_text?: string | null;
  offer_text?: string | null;
  product_names?: string[];
  has_logo?: boolean;
  logo_position?: string;
}

export interface ModuleVisuals {
  background_color?: string;
  background_type?: string;
  text_color_primary?: string;
  text_color_secondary?: string;
  accent_color?: string;
  has_image?: boolean;
  image_type?: string;
  image_position?: string;
  image_coverage_percent?: number;
  cta_style?: {
    shape?: string;
    fill_color?: string;
    text_color?: string;
  };
}

export interface ModuleLayout {
  alignment?: string;
  content_width_percent?: number;
  element_order?: string[];
}

export interface Module {
  id: string;
  campaign_id: string;
  brand_id: string;
  module_index: number;
  module_type: string;
  module_type_confidence: number;
  image_url: string;
  thumbnail_url?: string;
  y_start: number;
  y_end: number;
  width: number;
  height: number;
  content: ModuleContent;
  visuals: ModuleVisuals;
  layout: ModuleLayout;
  composition_notes?: string;
  quality_score: number;
  is_reference_quality: boolean;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export const MODULE_TYPES = [
  'announcement_bar',
  'logo_header',
  'hero',
  'product_card',
  'benefits_list',
  'free_gifts_module',
  'value_props_strip',
  'timeline_journey',
  'feature_diagram',
  'educational_block',
  'lifestyle_block',
  'mid_email_cta_banner',
  'footer'
] as const;

export type ModuleType = typeof MODULE_TYPES[number];

export const MODULE_TYPE_LABELS: Record<ModuleType, string> = {
  announcement_bar: 'Announcement Bar',
  logo_header: 'Logo Header',
  hero: 'Hero',
  product_card: 'Product Card',
  benefits_list: 'Benefits List',
  free_gifts_module: 'Free Gifts Module',
  value_props_strip: 'Value Props Strip',
  timeline_journey: 'Timeline Journey',
  feature_diagram: 'Feature Diagram',
  educational_block: 'Educational Block',
  lifestyle_block: 'Lifestyle Block',
  mid_email_cta_banner: 'Mid-Email CTA Banner',
  footer: 'Footer'
};
