// Simple Icons CDN utility for fetching social media icons
// https://simpleicons.org/ - Free SVG icons for popular brands

export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest' | 'snapchat' | 'whatsapp' | 'telegram';

// Map platform names to Simple Icons slugs
const PLATFORM_SLUGS: Record<string, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  twitter: 'x',
  x: 'x',
  linkedin: 'linkedin',
  youtube: 'youtube',
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  snapchat: 'snapchat',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  threads: 'threads',
  discord: 'discord',
  reddit: 'reddit',
  twitch: 'twitch',
  spotify: 'spotify',
  apple: 'apple',
  amazon: 'amazon',
};

// Brand colors for each platform (from Simple Icons)
export const PLATFORM_COLORS: Record<string, string> = {
  facebook: '0866FF',
  instagram: 'E4405F',
  twitter: '000000',
  x: '000000',
  linkedin: '0A66C2',
  youtube: 'FF0000',
  tiktok: '000000',
  pinterest: 'BD081C',
  snapchat: 'FFFC00',
  whatsapp: '25D366',
  telegram: '26A5E4',
  threads: '000000',
  discord: '5865F2',
  reddit: 'FF4500',
  twitch: '9146FF',
  spotify: '1DB954',
};

/**
 * Get the Simple Icons CDN URL for a social platform icon
 * @param platform - The social platform name
 * @param color - Hex color without # (default: 'ffffff' for white)
 * @returns CDN URL for the SVG icon
 */
export function getSocialIconUrl(platform: string, color: string = 'ffffff'): string {
  const slug = PLATFORM_SLUGS[platform.toLowerCase()] || platform.toLowerCase();
  const cleanColor = color.replace('#', '');
  return `https://cdn.simpleicons.org/${slug}/${cleanColor}`;
}

/**
 * Get the Simple Icons CDN URL with the platform's brand color
 * @param platform - The social platform name
 * @returns CDN URL for the SVG icon in brand color
 */
export function getSocialIconBrandColor(platform: string): string {
  const color = PLATFORM_COLORS[platform.toLowerCase()] || 'ffffff';
  return getSocialIconUrl(platform, color);
}

/**
 * Check if a platform is supported by Simple Icons
 */
export function isPlatformSupported(platform: string): boolean {
  return platform.toLowerCase() in PLATFORM_SLUGS;
}

/**
 * Get all supported platforms
 */
export function getSupportedPlatforms(): string[] {
  return Object.keys(PLATFORM_SLUGS);
}

/**
 * Detect platform from URL
 */
export function detectPlatformFromUrl(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  
  for (const platform of Object.keys(PLATFORM_SLUGS)) {
    if (lowerUrl.includes(platform) || lowerUrl.includes(PLATFORM_SLUGS[platform])) {
      return platform;
    }
  }
  
  return null;
}
