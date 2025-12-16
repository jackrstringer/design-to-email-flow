import { useMemo } from 'react';
import type { ProcessedSlice } from '@/types/slice';

interface CampaignPreviewFrameProps {
  slices: ProcessedSlice[];
  className?: string;
}

export function CampaignPreviewFrame({ slices, className }: CampaignPreviewFrameProps) {
  // Build the full campaign HTML from all slices
  const campaignHtml = useMemo(() => {
    const sliceHtml = slices.map((slice, index) => {
      if (slice.type === 'html' && slice.htmlContent) {
        // HTML slice - render the HTML content directly
        return slice.htmlContent;
      } else {
        // Image slice - wrap in table row with optional link
        const imgTag = `<img src="${slice.imageUrl}" alt="${slice.altText || `Section ${index + 1}`}" style="display: block; width: 100%; max-width: 600px; height: auto; border: 0;" />`;
        
        const content = slice.link 
          ? `<a href="${slice.link}" target="_blank" style="text-decoration: none;">${imgTag}</a>`
          : imgTag;
        
        return `<tr><td align="center" style="padding: 0;">${content}</td></tr>`;
      }
    }).join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .email-wrapper {
      width: 100%;
      background-color: #ffffff;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table class="email-container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto;">
      ${sliceHtml}
    </table>
  </div>
</body>
</html>`;
  }, [slices]);

  return (
    <iframe
      srcDoc={campaignHtml}
      title="Campaign Preview"
      className={className}
      sandbox="allow-same-origin"
      style={{ border: 'none', width: '100%', height: '100%' }}
    />
  );
}
