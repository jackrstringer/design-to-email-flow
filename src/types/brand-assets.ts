export interface SocialLink {
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok';
  url: string;
}

export interface LogoAsset {
  url: string;
  publicId: string;
}

export interface BrandAssets {
  websiteUrl?: string;
  darkLogo?: LogoAsset;  // For light backgrounds
  lightLogo?: LogoAsset; // For dark backgrounds
  socialLinks: SocialLink[];
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
  logoUrl?: string;
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
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
};
