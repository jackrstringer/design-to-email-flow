// Simple Icons CDN utility for fetching social media icons
// https://simpleicons.org/ - Free SVG icons for popular brands

import { supabase } from '@/integrations/supabase/client';

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
 * Get the Simple Icons CDN URL for a social platform icon (for preview only)
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
 * Upload social icon to Cloudinary and return the hosted URL
 * This should be used for production emails instead of CDN URLs
 * @param platform - The social platform name
 * @param color - Hex color without # (default: 'ffffff' for white)
 * @param brandDomain - Brand domain for organizing uploads
 * @returns Promise with Cloudinary URL
 */
export async function uploadSocialIconToCloudinary(
  platform: string, 
  color: string = 'ffffff',
  brandDomain?: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('upload-social-icon', {
      body: { platform, color, brandDomain }
    });

    if (error) {
      console.error('Error uploading social icon:', error);
      return null;
    }

    if (!data.success) {
      console.error('Social icon upload failed:', data.error);
      return null;
    }

    return {
      url: data.url,
      publicId: data.publicId,
    };
  } catch (err) {
    console.error('Failed to upload social icon:', err);
    return null;
  }
}

/**
 * Upload all social icons for a brand and return Cloudinary-hosted URLs
 * @param socialLinks - Array of social links with platform and url
 * @param color - Icon color (default: 'ffffff' for white)
 * @param brandDomain - Brand domain for organizing uploads
 * @returns Promise with array of social icon data including Cloudinary URLs
 */
export async function uploadAllSocialIcons(
  socialLinks: Array<{ platform: string; url: string }>,
  color: string = 'ffffff',
  brandDomain?: string
): Promise<Array<{ platform: string; url: string; iconUrl: string }>> {
  const results = await Promise.all(
    socialLinks.map(async (link) => {
      const cloudinaryResult = await uploadSocialIconToCloudinary(
        link.platform,
        color,
        brandDomain
      );

      return {
        platform: link.platform,
        url: link.url,
        // Use Cloudinary URL if upload succeeded, fall back to CDN for preview
        iconUrl: cloudinaryResult?.url || getSocialIconUrl(link.platform, color),
      };
    })
  );

  return results;
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
