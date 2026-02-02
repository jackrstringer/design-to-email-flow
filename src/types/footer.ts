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
  yEnd?: number;            // Pixel Y where legal section ends (for positioning)
  backgroundColor: string;  // Hex color
  textColor: string;        // Hex color
  
  // NEW: Editable rich text content with Klaviyo merge tags embedded
  content?: string;         // HTML string with merge tags like {{ organization.name }}
  
  // NEW: Typography controls
  fontSize?: number;        // Font size in px (default: 11)
  lineHeight?: number;      // Line height multiplier (default: 1.6)
  textAlign?: 'left' | 'center' | 'right'; // Text alignment (default: center)
  
  // NEW: Spacing controls
  paddingTop?: number;      // Padding top in px (default: 24)
  paddingBottom?: number;   // Padding bottom in px (default: 24)
  paddingHorizontal?: number; // Padding left/right in px (default: 20)
  
  // OCR-detected elements for reference
  detectedElements: {
    type: LegalElementType;
    text: string;
  }[];
  
  // NEW: Compliance validation flags
  hasOrgName?: boolean;
  hasOrgAddress?: boolean;
  hasUnsubscribe?: boolean;
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

// Generate default legal HTML content with Klaviyo merge tags
export function generateDefaultLegalContent(): string {
  return `{{ organization.name }} | {{ organization.address }}<br><br><a href="{% unsubscribe_url %}" style="text-decoration: underline;">Unsubscribe</a> | <a href="{% manage_preferences_url %}" style="text-decoration: underline;">Manage Preferences</a>`;
}

// Generate legal HTML section with Klaviyo merge tags
export function generateLegalHtml(legalSection: LegalSectionData, footerWidth: number = 600): string {
  const bgColor = legalSection.backgroundColor || '#1a1a1a';
  const textColor = legalSection.textColor || '#ffffff';
  const fontSize = legalSection.fontSize || 11;
  const lineHeight = legalSection.lineHeight || 1.6;
  const textAlign = legalSection.textAlign || 'center';
  const paddingTop = legalSection.paddingTop ?? 24;
  const paddingBottom = legalSection.paddingBottom ?? 24;
  const paddingHorizontal = legalSection.paddingHorizontal ?? 20;
  
  // Use custom content if provided, otherwise use default template
  const content = legalSection.content || generateDefaultLegalContent();
  
  // Inject link color styles into the content
  const styledContent = content.replace(
    /<a\s+href=/g, 
    `<a style="color: ${textColor};" href=`
  );
  
  return `
<tr>
  <td align="${textAlign}" style="padding: ${paddingTop}px ${paddingHorizontal}px ${paddingBottom}px; background-color: ${bgColor};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="${textAlign}" style="font-family: Arial, sans-serif; font-size: ${fontSize}px; line-height: ${lineHeight}; color: ${textColor};">
          ${styledContent}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Generate email-compatible HTML for an image-based footer
 * Combines cropped image slices with a Klaviyo-compatible legal HTML section
 * Supports inserting legal section at correct Y position (not always at end)
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
  
  // Sort slices by yTop to determine correct order
  const sortedByY = [...slices].sort((a, b) => a.yTop - b.yTop);
  
  // Determine where legal section should be inserted based on yStart
  const legalYStart = legalSection?.yStart ?? Infinity;
  
  // Split slices into before and after legal section
  const slicesBefore = sortedByY.filter(s => s.yBottom <= legalYStart);
  const slicesAfter = sortedByY.filter(s => s.yTop >= (legalSection?.yEnd ?? legalYStart));
  
  // If no clear split, just use all slices before legal
  const slicesToRender = slicesBefore.length > 0 ? slicesBefore : sortedByY;
  const slicesAfterLegal = slicesAfter.length > 0 && slicesBefore.length > 0 ? slicesAfter : [];
  
  // Helper to render a group of slices
  const renderSliceGroup = (sliceGroup: ImageFooterSlice[]) => {
    // Group slices by rowIndex for proper row handling
    const slicesByRow = new Map<number, ImageFooterSlice[]>();
    for (const slice of sliceGroup) {
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
        if (!slice) return;
        
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
  };
  
  // Render slices before legal section
  renderSliceGroup(slicesToRender);
  
  // Legal section with Klaviyo merge tags (now uses content field)
  if (legalSection) {
    const bgColor = legalSection.backgroundColor || '#1a1a1a';
    const textColor = legalSection.textColor || '#ffffff';
    const fontSize = legalSection.fontSize || 11;
    const lineHeight = legalSection.lineHeight || 1.6;
    const textAlign = legalSection.textAlign || 'center';
    const paddingTop = legalSection.paddingTop ?? 24;
    const paddingBottom = legalSection.paddingBottom ?? 24;
    const paddingHorizontal = legalSection.paddingHorizontal ?? 20;
    
    // Use custom content if provided, otherwise use default template
    const content = legalSection.content || generateDefaultLegalContent();
    
    // Inject link color styles into the content
    const styledContent = content.replace(
      /<a\s+href=/g, 
      `<a style="color: ${textColor};" href=`
    );
    
    lines.push('      <!-- Legal Section (Klaviyo merge tags) -->');
    lines.push('      <tr>');
    lines.push(`        <td align="${textAlign}" style="padding: ${paddingTop}px ${paddingHorizontal}px ${paddingBottom}px; background-color: ${bgColor};">`);
    lines.push(`          <div style="margin: 0; font-size: ${fontSize}px; line-height: ${lineHeight}; color: ${textColor}; font-family: Arial, Helvetica, sans-serif;">`);
    lines.push(`            ${styledContent}`);
    lines.push('          </div>');
    lines.push('        </td>');
    lines.push('      </tr>');
  }
  
  // Render slices after legal section (for cases like One Sol where fine print is in middle)
  if (slicesAfterLegal.length > 0) {
    renderSliceGroup(slicesAfterLegal);
  }
  
  lines.push('    </table>');
  lines.push('  </td>');
  lines.push('</tr>');
  lines.push('<!-- FOOTER END -->');
  
  return lines.join('\n');
}
