import { useMemo } from 'react';
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
    const sliceHtml = slices.map((slice, index) => {
      if (slice.type === 'html' && slice.htmlContent) {
        // HTML slice - check if it's already wrapped in a table row or is raw content
        const content = slice.htmlContent.trim();
        
        // If the content already starts with <tr> or is a table structure, return as-is
        if (content.startsWith('<tr') || content.startsWith('<TR')) {
          return content;
        }
        
        // If it's a standalone element (not a tr), wrap it in a table row
        return `<tr><td align="center" style="padding: 0;">${content}</td></tr>`;
      } else {
        // Image slice - wrap in table row with optional link
        const imgTag = `<img src="${slice.imageUrl}" alt="${slice.altText || `Section ${index + 1}`}" style="display: block; width: 100%; max-width: ${width}px; height: auto; border: 0;" />`;
        
        const content = slice.link 
          ? `<a href="${slice.link}" target="_blank" style="text-decoration: none;">${imgTag}</a>`
          : imgTag;
        
        return `<tr><td align="center" style="padding: 0;">${content}</td></tr>`;
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

  // Calculate approximate height based on content
  // Use a large height to ensure full content is visible
  return (
    <iframe
      srcDoc={campaignHtml}
      title="Campaign Preview"
      className={className}
      sandbox="allow-same-origin"
      style={{ border: 'none', width: `${width}px`, minHeight: '2000px' }}
    />
  );
}
