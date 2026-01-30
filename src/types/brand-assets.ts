export interface SocialLink {
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok';
  url: string;
}

export interface LogoAsset {
  url: string;
  publicId: string;
}

// Social icon variants for footer
export interface SocialIconAsset {
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok';
  whiteUrl?: string;
  whitePublicId?: string;
  blackUrl?: string;
  blackPublicId?: string;
}

// Footer assets stored per brand
export interface FooterAssets {
  logoUrl?: string;
  logoPublicId?: string;
  socialIcons: SocialIconAsset[];
  html?: string;
}

// Brand footer (stored in brand_footers table)
export interface BrandFooter {
  id: string;
  brandId: string;
  name: string;
  html: string;
  isPrimary: boolean;
  logoUrl?: string;
  logoPublicId?: string;
  createdAt: string;
  updatedAt: string;
}

// Font detected from website
export interface DetectedFont {
  family: string;
  role?: 'heading' | 'body' | 'display' | 'code';
}

// Spacing settings from Firecrawl
export interface BrandSpacing {
  baseUnit?: number;
  borderRadius?: string;
}

// Button component style from Firecrawl
export interface ButtonStyle {
  background?: string;
  textColor?: string;
  borderRadius?: string;
}

// Component styles from Firecrawl
export interface BrandComponents {
  buttonPrimary?: ButtonStyle;
  buttonSecondary?: ButtonStyle;
}

// Typography settings for a brand
export interface BrandTypography {
  fontFamilies?: {
    primary?: string;
    heading?: string;
    code?: string;
  };
  fontSizes?: {
    h1?: string;
    h2?: string;
    h3?: string;
    body?: string;
  };
  fontWeights?: Record<string, number>;
  // Additional data from Firecrawl
  fonts?: DetectedFont[];
  spacing?: BrandSpacing;
  components?: BrandComponents;
}

// HTML formatting rule for email generation
export interface HtmlFormattingRule {
  id: string;
  name: string;
  description?: string;
  code: string;
}

export interface BrandAssets {
  websiteUrl?: string;
  darkLogo?: LogoAsset;  // For light backgrounds
  lightLogo?: LogoAsset; // For dark backgrounds
  socialLinks: SocialLink[];
  allLinks: string[];    // All links from the brand's website for linking
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
}

export interface BrandAnalysisResult {
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
  };
  socialLinks: SocialLink[];
  allLinks: string[];
}

// Database brand type
export interface Brand {
  id: string;
  name: string;
  domain: string;
  websiteUrl?: string;
  darkLogoUrl?: string;
  darkLogoPublicId?: string;
  lightLogoUrl?: string;
  lightLogoPublicId?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  backgroundColor?: string;
  textPrimaryColor?: string;
  linkColor?: string;
  socialLinks: SocialLink[];
  allLinks: string[];
  // Footer fields (legacy - now use brand_footers table)
  footerHtml?: string;
  footerLogoUrl?: string;
  footerLogoPublicId?: string;
  socialIcons?: SocialIconAsset[];
  footerConfigured?: boolean;
  // Per-brand Klaviyo API key
  klaviyoApiKey?: string;
  // Typography and formatting
  typography?: BrandTypography;
  htmlFormattingRules?: HtmlFormattingRule[];
  // ClickUp integration
  clickupApiKey?: string;
  clickupWorkspaceId?: string;
  clickupListId?: string;
  // Link intelligence
  linkPreferences?: import('./link-intelligence').BrandLinkPreferences;
  createdAt: string;
  updatedAt: string;
}

// Database campaign type
export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  originalImageUrl?: string;
  generatedHtml?: string;
  thumbnailUrl?: string;
  blocks: any[];
  status: 'draft' | 'completed' | 'pushed_to_klaviyo';
  klaviyoTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { id: 'twitter', label: 'Twitter/X', placeholder: 'https://twitter.com/yourhandle' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourcompany' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
] as const;

export const DEFAULT_BRAND_ASSETS: BrandAssets = {
  socialLinks: [],
  allLinks: [],
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
};
