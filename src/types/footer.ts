// Footer types for both HTML and Image-based footers

export type FooterType = 'html' | 'image';

// Legal element types detected via OCR
export type LegalElementType = 'unsubscribe' | 'preferences' | 'address' | 'org_name' | 'copyright';

// Single slice from image footer
export interface ImageFooterSlice {
  // Slice positioning
  yTop: number;
  yBottom: number;
  
  // Image data
  imageUrl: string | null;
  width: number;
  height: number;
  
  // Content metadata
  name?: string;
  altText: string;
  link: string | null;
  isClickable: boolean;
  
  // Link source tracking
  linkSource?: 'index' | 'default' | 'rule' | 'needs_search' | 'not_clickable' | 'manual';
  linkVerified?: boolean;
  
  // CTA detection
  hasCTA?: boolean;
  ctaText?: string | null;
  
  // Horizontal split (for social icons, nav links)
  horizontalSplit?: {
    columns: 2 | 3 | 4 | 5 | 6;
    gutterPositions: number[];
  };
  
  // Column info for horizontal splits
  column?: number;
  totalColumns?: number;
  rowIndex?: number;
  
  // Column-specific image URLs for horizontal splits
  columnImageUrls?: string[];
}

// Legal section metadata extracted from footer
export interface LegalSectionData {
  yStart: number;           // Pixel Y where legal section begins
  backgroundColor: string;  // Hex color
  textColor: string;        // Hex color
  detectedElements: {
    type: LegalElementType;
    text: string;
  }[];
}

// Response from process-footer-queue edge function
export interface FooterSliceResponse {
  success: boolean;
  error?: string;
  
  // Visual slices (above legal cutoff)
  slices: ImageFooterSlice[];
  
  // Legal section metadata
  legalSection: LegalSectionData | null;
  
  // Processing metadata
  processingTimeMs: number;
  debug?: {
    totalTextBlocks: number;
    legalTextBlocks: number;
    sliceCount: number;
  };
}

// Data stored in brand_footers.image_slices
export interface StoredImageFooterData {
  slices: ImageFooterSlice[];
  legalSection: LegalSectionData | null;
  originalImageUrl: string;
  generatedAt: string;
  jobId?: string;
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

/**
 * Generate email-compatible HTML for an image-based footer
 * Combines cropped image slices with a Klaviyo-compatible legal HTML section
 */
export function generateImageFooterHtml(
  slices: ImageFooterSlice[],
  legalSection: LegalSectionData | null,
  footerWidth: number = 600
): string {
  const lines: string[] = [];
  
  lines.push('<!-- FOOTER START -->');
  lines.push('<tr>');
  lines.push('  <td style="padding: 0;">');
  lines.push('    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">');
  
  // Group slices by rowIndex for proper row handling
  const slicesByRow = new Map<number, ImageFooterSlice[]>();
  for (const slice of slices) {
    const rowIndex = slice.rowIndex ?? 0;
    if (!slicesByRow.has(rowIndex)) {
      slicesByRow.set(rowIndex, []);
    }
    slicesByRow.get(rowIndex)!.push(slice);
  }
  
  // Sort rows by rowIndex
  const sortedRows = Array.from(slicesByRow.entries()).sort((a, b) => a[0] - b[0]);
  
  for (const [rowIndex, rowSlices] of sortedRows) {
    // Sort slices by column within the row
    const sortedSlices = rowSlices.sort((a, b) => (a.column ?? 0) - (b.column ?? 0));
    const isMultiColumn = sortedSlices.length > 1 || (sortedSlices[0]?.totalColumns ?? 1) > 1;
    
    if (isMultiColumn) {
      // Multi-column row (e.g., social icons)
      const totalColumns = sortedSlices[0]?.totalColumns || sortedSlices.length;
      const colWidth = Math.floor(footerWidth / totalColumns);
      const colWidthPercent = (100 / totalColumns).toFixed(2);
      
      lines.push('      <tr>');
      lines.push('        <td align="center">');
      lines.push('          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">');
      lines.push('            <tr>');
      
      for (const slice of sortedSlices) {
        const linkHref = slice.link || '#';
        const altText = slice.altText || `Column ${(slice.column ?? 0) + 1}`;
        
        lines.push(`              <td width="${colWidthPercent}%" align="center" valign="top">`);
        if (slice.isClickable && slice.link) {
          lines.push(`                <a href="${linkHref}" target="_blank" style="text-decoration: none;">`);
        }
        if (slice.imageUrl) {
          lines.push(`                  <img src="${slice.imageUrl}" width="${colWidth}" alt="${altText}" style="display: block; border: 0; width: 100%; height: auto;" />`);
        }
        if (slice.isClickable && slice.link) {
          lines.push('                </a>');
        }
        lines.push('              </td>');
      }
      
      lines.push('            </tr>');
      lines.push('          </table>');
      lines.push('        </td>');
      lines.push('      </tr>');
    } else {
      // Single full-width slice
      const slice = sortedSlices[0];
      if (!slice) continue;
      
      const linkHref = slice.link || '#';
      const altText = slice.altText || `Footer section ${rowIndex + 1}`;
      
      lines.push('      <tr>');
      lines.push('        <td align="center">');
      if (slice.isClickable && slice.link) {
        lines.push(`          <a href="${linkHref}" target="_blank" style="text-decoration: none;">`);
      }
      if (slice.imageUrl) {
        lines.push(`            <img src="${slice.imageUrl}" width="${footerWidth}" alt="${altText}" style="display: block; border: 0; width: 100%; height: auto;" />`);
      }
      if (slice.isClickable && slice.link) {
        lines.push('          </a>');
      }
      lines.push('        </td>');
      lines.push('      </tr>');
    }
  }
  
  // Legal section with Klaviyo merge tags
  if (legalSection) {
    const bgColor = legalSection.backgroundColor || '#1a1a1a';
    const textColor = legalSection.textColor || '#ffffff';
    
    lines.push('      <!-- Legal Section (Klaviyo merge tags) -->');
    lines.push('      <tr>');
    lines.push(`        <td align="center" style="padding: 24px 20px; background-color: ${bgColor};">`);
    lines.push(`          <p style="margin: 0; font-size: 11px; line-height: 1.6; color: ${textColor}; font-family: Arial, Helvetica, sans-serif;">`);
    lines.push('            {{ organization.name }} | {{ organization.address }}');
    lines.push('          </p>');
    lines.push(`          <p style="margin: 12px 0 0; font-size: 11px; color: ${textColor}; font-family: Arial, Helvetica, sans-serif;">`);
    lines.push(`            <a href="{% unsubscribe_url %}" style="color: ${textColor}; text-decoration: underline;">Unsubscribe</a>`);
    lines.push('            &nbsp;|&nbsp;');
    lines.push(`            <a href="{% manage_preferences_url %}" style="color: ${textColor}; text-decoration: underline;">Manage Preferences</a>`);
    lines.push('          </p>');
    lines.push('        </td>');
    lines.push('      </tr>');
  }
  
  lines.push('    </table>');
  lines.push('  </td>');
  lines.push('</tr>');
  lines.push('<!-- FOOTER END -->');
  
  return lines.join('\n');
}
