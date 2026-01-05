import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fills?: Array<{
    type: string;
    color?: FigmaColor;
    imageRef?: string;
    opacity?: number;
  }>;
  strokes?: Array<{
    type: string;
    color?: FigmaColor;
  }>;
  strokeWeight?: number;
  strokeAlign?: string;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  characters?: string;
  style?: {
    fontFamily?: string;
    fontPostScriptName?: string;
    fontSize?: number;
    fontWeight?: number;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    letterSpacing?: number;
    lineHeightPx?: number;
    lineHeightPercent?: number;
  };
  children?: FigmaNode[];
  layoutMode?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  counterAxisSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
}

// Enhanced design data for HTML generation
interface DesignData {
  colors: string[];
  fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }>;
  texts: Array<{ content: string; isUrl: boolean; fontSize?: number; fontWeight?: number; color?: string }>;
  spacing: { paddings: number[]; gaps: number[] };
  borders: Array<{ color: string; width: number }>;
  elements: Array<{ 
    name: string; 
    width: number; 
    height: number; 
    type: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
  }>;
  rootDimensions: { width: number; height: number };
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string | null } | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/(design|file|proto)\/([a-zA-Z0-9]+)/);
    if (!pathMatch) return null;
    const fileKey = pathMatch[2];
    const nodeIdParam = urlObj.searchParams.get('node-id');
    const nodeId = nodeIdParam ? nodeIdParam.replace('-', ':') : null;
    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

function rgbaToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const urlPattern = /^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i;

// ENHANCED: Extract ALL design data from node tree
function extractDesignData(node: FigmaNode): DesignData {
  const colors = new Set<string>();
  const fonts: Array<{ family: string; size: number; weight: number; lineHeight: number }> = [];
  const texts: Array<{ content: string; isUrl: boolean; fontSize?: number; fontWeight?: number; color?: string }> = [];
  const paddings = new Set<number>();
  const gaps = new Set<number>();
  const seenFonts = new Set<string>();
  
  // NEW: Borders and elements arrays
  const borders: Array<{ color: string; width: number }> = [];
  const seenBorders = new Set<string>();
  const elements: Array<{ 
    name: string; 
    width: number; 
    height: number; 
    type: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
  }> = [];

  function traverse(n: FigmaNode) {
    // Extract colors from fills
    if (n.fills) {
      for (const fill of n.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          colors.add(rgbaToHex(fill.color));
        }
      }
    }

    // Extract colors from strokes AND borders
    if (n.strokes && n.strokes.length > 0) {
      for (const stroke of n.strokes) {
        if (stroke.type === 'SOLID' && stroke.color) {
          const strokeColor = rgbaToHex(stroke.color);
          colors.add(strokeColor);
          
          // Extract border info
          if (n.strokeWeight && n.strokeWeight > 0) {
            const borderKey = `${strokeColor}-${n.strokeWeight}`;
            if (!seenBorders.has(borderKey)) {
              seenBorders.add(borderKey);
              borders.push({
                color: strokeColor,
                width: n.strokeWeight
              });
            }
          }
        }
      }
    }

    // Extract text content and font styles
    if (n.type === 'TEXT' && n.characters) {
      const content = n.characters.trim();
      if (content) {
        let textColor: string | undefined;
        if (n.fills && n.fills.length > 0) {
          const textFill = n.fills.find(f => f.type === 'SOLID' && f.color);
          if (textFill?.color) {
            textColor = rgbaToHex(textFill.color);
          }
        }
        
        texts.push({
          content,
          isUrl: urlPattern.test(content),
          fontSize: n.style?.fontSize,
          fontWeight: n.style?.fontWeight,
          color: textColor
        });
      }

      if (n.style) {
        const fontKey = `${n.style.fontFamily}-${n.style.fontSize}-${n.style.fontWeight}`;
        if (!seenFonts.has(fontKey)) {
          seenFonts.add(fontKey);
          fonts.push({
            family: n.style.fontFamily || 'Arial',
            size: n.style.fontSize || 14,
            weight: n.style.fontWeight || 400,
            lineHeight: n.style.lineHeightPx || (n.style.fontSize || 14) * 1.4
          });
        }
      }
    }

    // Extract spacing from auto-layout AND non-auto-layout elements
    if (n.paddingTop !== undefined) paddings.add(n.paddingTop);
    if (n.paddingRight !== undefined) paddings.add(n.paddingRight);
    if (n.paddingBottom !== undefined) paddings.add(n.paddingBottom);
    if (n.paddingLeft !== undefined) paddings.add(n.paddingLeft);
    if (n.itemSpacing !== undefined) gaps.add(n.itemSpacing);
    if (n.counterAxisSpacing !== undefined) gaps.add(n.counterAxisSpacing);

    // Extract element dimensions and properties
    if (n.absoluteBoundingBox && n.name) {
      const element: typeof elements[0] = {
        name: n.name,
        width: Math.round(n.absoluteBoundingBox.width),
        height: Math.round(n.absoluteBoundingBox.height),
        type: n.type
      };

      // Add background color
      if (n.fills && n.fills.length > 0) {
        const solidFill = n.fills.find(f => f.type === 'SOLID' && f.color);
        if (solidFill?.color) {
          element.backgroundColor = rgbaToHex(solidFill.color);
        }
      }

      // Add border info
      if (n.strokes && n.strokes.length > 0 && n.strokeWeight) {
        const solidStroke = n.strokes.find(s => s.type === 'SOLID' && s.color);
        if (solidStroke?.color) {
          element.borderColor = rgbaToHex(solidStroke.color);
          element.borderWidth = n.strokeWeight;
        }
      }

      // Add border radius
      if (n.cornerRadius) {
        element.borderRadius = n.cornerRadius;
      }

      // Add padding
      if (n.paddingTop !== undefined || n.paddingRight !== undefined || 
          n.paddingBottom !== undefined || n.paddingLeft !== undefined) {
        element.padding = {
          top: n.paddingTop || 0,
          right: n.paddingRight || 0,
          bottom: n.paddingBottom || 0,
          left: n.paddingLeft || 0
        };
      }

      // Add gap/spacing
      if (n.itemSpacing) {
        element.gap = n.itemSpacing;
      }

      elements.push(element);
    }

    // Recurse into children
    if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  }

  traverse(node);

  // Get root dimensions
  const rootDimensions = {
    width: node.absoluteBoundingBox?.width || 600,
    height: node.absoluteBoundingBox?.height || 400
  };

  return {
    colors: Array.from(colors),
    fonts: fonts.sort((a, b) => b.size - a.size),
    texts,
    spacing: {
      paddings: Array.from(paddings).filter(p => p > 0).sort((a, b) => a - b),
      gaps: Array.from(gaps).filter(g => g > 0).sort((a, b) => a - b)
    },
    borders,
    elements,
    rootDimensions
  };
}

function processNode(node: FigmaNode, parentBox?: { x: number; y: number }): any {
  const box = node.absoluteBoundingBox;
  const relativeX = box && parentBox ? box.x - parentBox.x : 0;
  const relativeY = box && parentBox ? box.y - parentBox.y : 0;

  const processed: any = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: relativeX,
    y: relativeY,
    width: box?.width || 0,
    height: box?.height || 0,
  };

  // Extract background color
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find(f => f.type === 'SOLID' && f.color);
    const imageFill = node.fills.find(f => f.type === 'IMAGE');
    
    if (solidFill?.color) {
      processed.backgroundColor = rgbaToHex(solidFill.color);
      processed.backgroundOpacity = solidFill.opacity ?? 1;
    }
    if (imageFill?.imageRef) {
      processed.imageRef = imageFill.imageRef;
    }
  }

  // Extract stroke/border
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.color);
    if (solidStroke?.color) {
      processed.borderColor = rgbaToHex(solidStroke.color);
      processed.borderWidth = node.strokeWeight;
    }
  }

  // Corner radius
  if (node.cornerRadius) {
    processed.borderRadius = node.cornerRadius;
  }

  // Text content
  if (node.type === 'TEXT' && node.characters) {
    processed.text = node.characters;
    
    if (node.style) {
      processed.fontFamily = node.style.fontFamily || 'Arial';
      processed.fontSize = node.style.fontSize || 14;
      processed.fontWeight = node.style.fontWeight || 400;
      processed.textAlign = node.style.textAlignHorizontal?.toLowerCase() || 'left';
      processed.letterSpacing = node.style.letterSpacing || 0;
      processed.lineHeight = node.style.lineHeightPx || (node.style.fontSize || 14) * 1.4;
    }

    if (node.fills && node.fills.length > 0) {
      const textFill = node.fills.find(f => f.type === 'SOLID' && f.color);
      if (textFill?.color) {
        processed.color = rgbaToHex(textFill.color);
      }
    }
  }

  // Auto-layout properties
  if (node.layoutMode) {
    processed.layoutMode = node.layoutMode;
    processed.padding = {
      top: node.paddingTop || 0,
      right: node.paddingRight || 0,
      bottom: node.paddingBottom || 0,
      left: node.paddingLeft || 0,
    };
    processed.itemSpacing = node.itemSpacing || 0;
  }

  // Process children recursively
  if (node.children && node.children.length > 0) {
    processed.children = node.children.map(child => 
      processNode(child, box || parentBox)
    );
  }

  return processed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { figmaUrl } = await req.json();
    
    if (!figmaUrl) {
      return new Response(
        JSON.stringify({ error: 'figmaUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) {
      return new Response(
        JSON.stringify({ error: 'Invalid Figma URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fileKey, nodeId } = parsed;
    const FIGMA_TOKEN = Deno.env.get('FIGMA_ACCESS_TOKEN');
    
    if (!FIGMA_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'FIGMA_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let apiUrl = `https://api.figma.com/v1/files/${fileKey}`;
    if (nodeId) {
      apiUrl += `/nodes?ids=${encodeURIComponent(nodeId)}`;
    }

    console.log('Fetching Figma data:', apiUrl);

    const figmaResponse = await fetch(apiUrl, {
      headers: { 'X-Figma-Token': FIGMA_TOKEN },
    });

    if (!figmaResponse.ok) {
      const errorText = await figmaResponse.text();
      console.error('Figma API error:', figmaResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Figma API error: ${figmaResponse.status}` }),
        { status: figmaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const figmaData = await figmaResponse.json();
    
    let rootNode: FigmaNode;
    if (nodeId && figmaData.nodes) {
      rootNode = figmaData.nodes[nodeId]?.document;
    } else {
      rootNode = figmaData.document;
    }

    if (!rootNode) {
      return new Response(
        JSON.stringify({ error: 'Node not found in Figma file' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processedDesign = processNode(rootNode);
    const designData = extractDesignData(rootNode);
    
    console.log('Extracted design data:', JSON.stringify({
      colorCount: designData.colors.length,
      fontCount: designData.fonts.length,
      borderCount: designData.borders.length,
      elementCount: designData.elements.length,
      rootDimensions: designData.rootDimensions,
      paddings: designData.spacing.paddings,
      gaps: designData.spacing.gaps,
    }, null, 2));

    // Collect all image refs for export
    const imageRefs: string[] = [];
    const collectImageRefs = (node: any) => {
      if (node.imageRef) imageRefs.push(node.imageRef);
      if (node.children) node.children.forEach(collectImageRefs);
    };
    collectImageRefs(processedDesign);

    let imageUrls: Record<string, string> = {};
    if (imageRefs.length > 0) {
      const imagesUrl = `https://api.figma.com/v1/files/${fileKey}/images`;
      const imagesResponse = await fetch(imagesUrl, {
        headers: { 'X-Figma-Token': FIGMA_TOKEN },
      });
      
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        imageUrls = imagesData.meta?.images || {};
      }
    }

    let exportedImageUrl: string | null = null;
    if (nodeId) {
      const exportUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`;
      const exportResponse = await fetch(exportUrl, {
        headers: { 'X-Figma-Token': FIGMA_TOKEN },
      });
      
      if (exportResponse.ok) {
        const exportData = await exportResponse.json();
        exportedImageUrl = exportData.images?.[nodeId] || null;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileKey,
        nodeId,
        design: processedDesign,
        designData,
        imageUrls,
        exportedImageUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching Figma design:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
