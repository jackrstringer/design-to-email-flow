import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FigmaDesignNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: string;
  letterSpacing?: number;
  lineHeight?: number;
  color?: string;
  imageRef?: string;
  layoutMode?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
  itemSpacing?: number;
  children?: FigmaDesignNode[];
}

interface TransformOptions {
  logoUrl?: string;
  lightLogoUrl?: string;
  darkLogoUrl?: string;
  socialIcons?: Array<{ platform: string; url: string; iconUrl: string }>;
  websiteUrl?: string;
  brandName?: string;
  imageUrls?: Record<string, string>;
}

// Web-safe font mapping
const fontFamilyMap: Record<string, string> = {
  'Inter': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  'Roboto': 'Roboto, -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  'Open Sans': '"Open Sans", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  'Lato': 'Lato, -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  'Montserrat': 'Montserrat, -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  'Poppins': 'Poppins, -apple-system, BlinkMacSystemFont, Arial, sans-serif',
  'SF Pro Display': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  'SF Pro Text': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  'Helvetica Neue': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Arial': 'Arial, Helvetica, sans-serif',
  'Georgia': 'Georgia, "Times New Roman", Times, serif',
  'Times New Roman': '"Times New Roman", Times, Georgia, serif',
};

function getWebSafeFont(font: string): string {
  return fontFamilyMap[font] || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
}

function generateInlineStyles(node: FigmaDesignNode): string {
  const styles: string[] = [];
  
  if (node.backgroundColor) {
    const opacity = node.backgroundOpacity ?? 1;
    if (opacity < 1) {
      // Convert hex to rgba
      const hex = node.backgroundColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      styles.push(`background-color: rgba(${r}, ${g}, ${b}, ${opacity})`);
    } else {
      styles.push(`background-color: ${node.backgroundColor}`);
    }
  }
  
  if (node.borderColor && node.borderWidth) {
    styles.push(`border: ${node.borderWidth}px solid ${node.borderColor}`);
  }
  
  if (node.borderRadius) {
    styles.push(`border-radius: ${node.borderRadius}px`);
  }
  
  if (node.color) {
    styles.push(`color: ${node.color}`);
  }
  
  if (node.fontFamily) {
    styles.push(`font-family: ${getWebSafeFont(node.fontFamily)}`);
  }
  
  if (node.fontSize) {
    styles.push(`font-size: ${node.fontSize}px`);
  }
  
  if (node.fontWeight) {
    styles.push(`font-weight: ${node.fontWeight}`);
  }
  
  if (node.textAlign) {
    styles.push(`text-align: ${node.textAlign}`);
  }
  
  if (node.lineHeight) {
    styles.push(`line-height: ${node.lineHeight}px`);
  }
  
  if (node.letterSpacing) {
    styles.push(`letter-spacing: ${node.letterSpacing}px`);
  }
  
  return styles.join('; ');
}

function isLogoNode(node: FigmaDesignNode): boolean {
  const name = node.name.toLowerCase();
  return name.includes('logo') || name.includes('brand');
}

function isSocialIconsContainer(node: FigmaDesignNode): boolean {
  const name = node.name.toLowerCase();
  return name.includes('social') || name.includes('icons');
}

function isNavLinks(node: FigmaDesignNode): boolean {
  const name = node.name.toLowerCase();
  return name.includes('nav') || name.includes('links') || name.includes('menu');
}

function isLegalText(node: FigmaDesignNode): boolean {
  const name = node.name.toLowerCase();
  const text = node.text?.toLowerCase() || '';
  return name.includes('legal') || name.includes('copyright') || name.includes('footer-text') ||
    text.includes('©') || text.includes('unsubscribe') || text.includes('privacy') || text.includes('terms');
}

function transformNodeToHtml(node: FigmaDesignNode, options: TransformOptions, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  
  // Handle text nodes
  if (node.type === 'TEXT' && node.text) {
    const styles = generateInlineStyles(node);
    
    // Check if it's a link (contains URL or certain keywords)
    const isLink = node.text.includes('http') || 
      ['unsubscribe', 'privacy', 'terms', 'contact'].some(kw => 
        node.text!.toLowerCase().includes(kw)
      );
    
    if (isLink) {
      const href = node.text.includes('http') ? node.text : '#';
      return `${indent}<a href="${href}" style="${styles}; text-decoration: none;">${node.text}</a>`;
    }
    
    return `${indent}<span style="${styles}">${node.text}</span>`;
  }
  
  // Handle logo placeholder
  if (isLogoNode(node) && options.lightLogoUrl) {
    const logoUrl = options.lightLogoUrl;
    const maxWidth = Math.min(node.width, 180);
    return `${indent}<img src="${logoUrl}" alt="${options.brandName || 'Logo'}" width="${maxWidth}" height="auto" style="display: block; border: 0; max-width: ${maxWidth}px; height: auto;" />`;
  }
  
  // Handle social icons container
  if (isSocialIconsContainer(node) && options.socialIcons && options.socialIcons.length > 0) {
    const iconsHtml = options.socialIcons.map(icon => 
      `<a href="${icon.url}" style="display: inline-block; margin: 0 8px;"><img src="${icon.iconUrl}" alt="${icon.platform}" width="24" height="24" style="display: block; border: 0;" /></a>`
    ).join('\n');
    
    return `${indent}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
${indent}  <tr>
${indent}    <td style="text-align: center;">
${iconsHtml}
${indent}    </td>
${indent}  </tr>
${indent}</table>`;
  }
  
  // Handle image nodes with imageRef
  if (node.imageRef && options.imageUrls?.[node.imageRef]) {
    const imageUrl = options.imageUrls[node.imageRef];
    return `${indent}<img src="${imageUrl}" alt="${node.name}" width="${Math.round(node.width)}" height="${Math.round(node.height)}" style="display: block; border: 0;" />`;
  }
  
  // Handle container nodes (FRAME, GROUP, COMPONENT, etc.)
  if (node.children && node.children.length > 0) {
    const containerStyles = generateInlineStyles(node);
    const paddingStyles = node.padding 
      ? `padding: ${node.padding.top}px ${node.padding.right}px ${node.padding.bottom}px ${node.padding.left}px;`
      : '';
    
    // Determine layout direction
    const isHorizontal = node.layoutMode === 'HORIZONTAL';
    const itemSpacing = node.itemSpacing || 0;
    
    // Sort children by position
    const sortedChildren = [...node.children].sort((a, b) => {
      if (isHorizontal) return a.x - b.x;
      return a.y - b.y;
    });
    
    const childrenHtml = sortedChildren
      .map(child => transformNodeToHtml(child, options, depth + 3))
      .filter(html => html.trim())
      .join('\n');
    
    if (!childrenHtml.trim()) return '';
    
    // Wrap in table structure
    if (isHorizontal) {
      // Horizontal layout - single row with multiple cells
      const cells = sortedChildren
        .map((child, i) => {
          const cellHtml = transformNodeToHtml(child, options, depth + 4);
          if (!cellHtml.trim()) return '';
          const spacing = i > 0 ? `padding-left: ${itemSpacing}px;` : '';
          return `${indent}      <td style="vertical-align: top; ${spacing}">\n${cellHtml}\n${indent}      </td>`;
        })
        .filter(html => html.trim())
        .join('\n');
      
      return `${indent}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${containerStyles} ${paddingStyles}">
${indent}  <tr>
${cells}
${indent}  </tr>
${indent}</table>`;
    } else {
      // Vertical layout - multiple rows
      const rows = sortedChildren
        .map((child, i) => {
          const cellHtml = transformNodeToHtml(child, options, depth + 4);
          if (!cellHtml.trim()) return '';
          const spacing = i > 0 ? `padding-top: ${itemSpacing}px;` : '';
          return `${indent}  <tr>
${indent}    <td style="${spacing}">
${cellHtml}
${indent}    </td>
${indent}  </tr>`;
        })
        .filter(html => html.trim())
        .join('\n');
      
      return `${indent}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${containerStyles} ${paddingStyles}">
${rows}
${indent}</table>`;
    }
  }
  
  // Empty node
  return '';
}

function generateEmailHtml(design: FigmaDesignNode, options: TransformOptions): string {
  const rootBgColor = design.backgroundColor || '#ffffff';
  const contentWidth = Math.min(design.width, 600);
  
  const contentHtml = transformNodeToHtml(design, options, 4);
  
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, address=no, email=no, date=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Footer</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table { border-collapse: collapse; }
    td { font-family: Arial, sans-serif; }
  </style>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .dark-mode-text { color: #ffffff !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${contentWidth}" style="max-width: ${contentWidth}px; background-color: ${rootBgColor};">
          <tr>
            <td style="padding: 0;">
${contentHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      design, 
      logoUrl,
      lightLogoUrl,
      darkLogoUrl,
      socialIcons,
      websiteUrl,
      brandName,
      imageUrls 
    } = await req.json();
    
    if (!design) {
      return new Response(
        JSON.stringify({ error: 'design data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const options: TransformOptions = {
      logoUrl,
      lightLogoUrl: lightLogoUrl || logoUrl,
      darkLogoUrl,
      socialIcons,
      websiteUrl,
      brandName,
      imageUrls,
    };

    const html = generateEmailHtml(design, options);

    return new Response(
      JSON.stringify({
        success: true,
        html,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error transforming Figma to HTML:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
