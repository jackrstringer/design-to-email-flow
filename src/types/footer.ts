// Footer types for both HTML and Image-based footers

export type FooterType = 'html' | 'image';

// Legal element types detected via OCR
export type LegalElementType = 'unsubscribe' | 'preferences' | 'address' | 'org_name' | 'copyright';

// Single slice from image footer
export interface ImageFooterSlice {
  id: string;
  imageUrl: string;        // Cloudinary URL
  yTop: number;            // Pixel position
  yBottom: number;         // Pixel position
  yTopPercent: number;     // Percentage for responsive
  yBottomPercent: number;  // Percentage for responsive
  altText: string;
  link: string | null;
  isClickable: boolean;
  // For multi-column rows (social icons, nav links)
  columns?: {
    imageUrl: string;
    link: string;
    altText: string;
    xStart: number;
    xEnd: number;
  }[];
}

// Legal section metadata extracted from footer
export interface LegalSectionData {
  yStart: number;           // Pixel Y where legal section begins
  yStartPercent: number;    // Percentage Y
  backgroundColor: string;  // Hex color
  textColor: string;        // Hex color
  detectedElements: {
    type: LegalElementType;
    text: string;
    yPosition: number;
  }[];
  // Raw text from legal section for reference
  rawText: string;
}

// Response from auto-slice-footer edge function
export interface FooterSliceResponse {
  success: boolean;
  error?: string;
  
  // Visual slices (above legal cutoff)
  slices: ImageFooterSlice[];
  
  // Legal section metadata
  legalSection: LegalSectionData | null;
  
  // Image dimensions
  dimensions: {
    width: number;
    height: number;
  };
  
  // Processing metadata
  processingTimeMs: number;
  debug?: {
    totalTextBlocks: number;
    legalTextBlocks: number;
    detectedKeywords: string[];
  };
}

// Data stored in brand_footers.image_slices
export interface StoredImageFooterData {
  slices: ImageFooterSlice[];
  legalSection: LegalSectionData | null;
  originalImageUrl: string;
  generatedAt: string;
}

// Generate legal HTML section with Klaviyo merge tags
export function generateLegalHtml(legalSection: LegalSectionData): string {
  const bgColor = legalSection.backgroundColor || '#ffffff';
  const textColor = legalSection.textColor || '#666666';
  
  return `
<tr>
  <td align="center" style="padding: 20px 30px; background-color: ${bgColor};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="font-family: Arial, sans-serif; font-size: 11px; line-height: 1.5; color: ${textColor};">
          {{ organization.name }}<br>
          {{ organization.address }}<br><br>
          <a href="{% unsubscribe_url %}" style="color: ${textColor}; text-decoration: underline;">Unsubscribe</a>
          &nbsp;|&nbsp;
          <a href="{% manage_preferences_url %}" style="color: ${textColor}; text-decoration: underline;">Manage Preferences</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

// Generate complete HTML for image-based footer
export function generateImageFooterHtml(
  slices: ImageFooterSlice[],
  legalSection: LegalSectionData | null,
  footerWidth: number = 600
): string {
  const sliceRows = slices.map(slice => {
    if (slice.columns && slice.columns.length > 1) {
      // Multi-column row (e.g., social icons)
      const columnTds = slice.columns.map(col => `
        <td align="center" style="padding: 0;">
          <a href="${col.link || '#'}" target="_blank" style="display: block;">
            <img src="${col.imageUrl}" alt="${col.altText}" style="display: block; max-width: 100%;" />
          </a>
        </td>`).join('');
      
      return `
<tr>
  <td style="padding: 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${columnTds}</tr>
    </table>
  </td>
</tr>`;
    } else {
      // Single full-width slice
      const linkStart = slice.link ? `<a href="${slice.link}" target="_blank" style="display: block;">` : '';
      const linkEnd = slice.link ? '</a>' : '';
      
      return `
<tr>
  <td align="center" style="padding: 0;">
    ${linkStart}<img src="${slice.imageUrl}" alt="${slice.altText}" width="${footerWidth}" style="display: block; width: 100%; max-width: ${footerWidth}px; height: auto;" />${linkEnd}
  </td>
</tr>`;
    }
  }).join('');

  const legalHtml = legalSection ? generateLegalHtml(legalSection) : '';

  return `<!-- FOOTER START -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: ${footerWidth}px; margin: 0 auto;">
  ${sliceRows}
  ${legalHtml}
</table>
<!-- FOOTER END -->`;
}
