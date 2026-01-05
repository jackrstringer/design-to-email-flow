import { useMemo, useState } from 'react';
import type { ProcessedSlice } from '@/types/slice';

interface CampaignPreviewFrameProps {
  slices: ProcessedSlice[];
  footerHtml?: string;
  className?: string;
  width?: number;
}

export function CampaignPreviewFrame({ slices, footerHtml, className, width = 600 }: CampaignPreviewFrameProps) {
  // Build the full campaign HTML from all slices
  const campaignHtml = useMemo(() => {
    // Group slices by rowIndex for multi-column support
    const rowGroups = new Map<number, ProcessedSlice[]>();
    slices.forEach((slice) => {
      const rowIdx = slice.rowIndex ?? slices.indexOf(slice);
      if (!rowGroups.has(rowIdx)) {
        rowGroups.set(rowIdx, []);
      }
      rowGroups.get(rowIdx)!.push(slice);
    });

    // Sort rows by rowIndex and generate HTML
    const sortedRows = Array.from(rowGroups.entries()).sort((a, b) => a[0] - b[0]);
    
    const sliceHtml = sortedRows.map(([_rowIndex, rowSlices]) => {
      // Sort slices within row by column index
      rowSlices.sort((a, b) => (a.column ?? 0) - (b.column ?? 0));
      
      const totalColumns = rowSlices[0]?.totalColumns ?? 1;
      
      if (totalColumns === 1) {
        // Single column row - original behavior
        const slice = rowSlices[0];
        const index = slices.indexOf(slice);
        
        if (slice.type === 'html' && slice.htmlContent) {
          const content = slice.htmlContent.trim();
          if (content.startsWith('<tr') || content.startsWith('<TR')) {
            return content;
          }
          return `<tr><td align="center" style="padding: 0;">${content}</td></tr>`;
        } else {
          const imgTag = `<img src="${slice.imageUrl}" alt="${slice.altText || `Section ${index + 1}`}" style="display: block; width: 100%; max-width: ${width}px; height: auto; border: 0;" />`;
          const content = slice.link 
            ? `<a href="${slice.link}" target="_blank" style="text-decoration: none;">${imgTag}</a>`
            : imgTag;
          return `<tr><td align="center" style="padding: 0;">${content}</td></tr>`;
        }
      } else {
        // Multi-column row - create nested table
        const columnWidth = Math.floor(width / totalColumns);
        const columnPercent = (100 / totalColumns).toFixed(2);
        
        const columnCells = rowSlices.map((slice, colIndex) => {
          if (slice.type === 'html' && slice.htmlContent) {
            return `<td width="${columnPercent}%" valign="top" style="padding: 0;">${slice.htmlContent}</td>`;
          }
          
          const imgTag = `<img src="${slice.imageUrl}" alt="${slice.altText || `Column ${colIndex + 1}`}" style="display: block; width: 100%; max-width: ${columnWidth}px; height: auto; border: 0;" />`;
          const content = slice.link 
            ? `<a href="${slice.link}" target="_blank" style="text-decoration: none;">${imgTag}</a>`
            : imgTag;
          return `<td width="${columnPercent}%" valign="top" style="padding: 0;">${content}</td>`;
        }).join('\n');
        
        return `<tr><td align="center" style="padding: 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>${columnCells}</tr>
          </table>
        </td></tr>`;
      }
    }).join('\n');

    // Append footer if provided
    const footerSection = footerHtml ? `
      <!-- Footer -->
      ${footerHtml}
    ` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
    }
    .email-wrapper {
      width: 100%;
      background-color: #ffffff;
    }
    .email-container {
      width: ${width}px;
      max-width: ${width}px;
      margin: 0 auto;
      background-color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="${width}" style="width: ${width}px; max-width: ${width}px; margin: 0 auto;">
      ${sliceHtml}
      ${footerSection}
    </table>
  </div>
</body>
</html>`;
  }, [slices, footerHtml, width]);

  const [contentHeight, setContentHeight] = useState(2000);

  const handleLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const height = e.currentTarget.contentDocument?.body?.scrollHeight;
      if (height) setContentHeight(height + 20);
    } catch {
      // Cross-origin fallback - keep default height
    }
  };

  return (
    <iframe
      srcDoc={campaignHtml}
      title="Campaign Preview"
      className={className}
      sandbox="allow-same-origin"
      onLoad={handleLoad}
      style={{ border: 'none', width: `${width}px`, height: `${contentHeight}px` }}
    />
  );
}
