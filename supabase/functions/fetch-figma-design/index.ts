import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  cornerRadius?: number;
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
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string | null } | null {
  try {
    const urlObj = new URL(url);
    
    // Match patterns:
    // https://www.figma.com/design/ABC123/FileName?node-id=1-234
    // https://www.figma.com/file/ABC123/FileName?node-id=1-234
    // https://www.figma.com/proto/ABC123/FileName?node-id=1-234
    const pathMatch = urlObj.pathname.match(/\/(design|file|proto)\/([a-zA-Z0-9]+)/);
    
    if (!pathMatch) return null;
    
    const fileKey = pathMatch[2];
    const nodeIdParam = urlObj.searchParams.get('node-id');
    
    // Convert node-id format: "1-234" -> "1:234" (Figma API format)
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

    // Text color from fills
    if (node.fills && node.fills.length > 0) {
      const textFill = node.fills.find(f => f.type === 'SOLID' && f.color);
      if (textFill?.color) {
        processed.color = rgbaToHex(textFill.color);
      }
    }
  }

  // Auto-layout properties
  if (node.layoutMode) {
    processed.layoutMode = node.layoutMode; // HORIZONTAL, VERTICAL, NONE
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

    // Fetch file/node data from Figma API
    let apiUrl = `https://api.figma.com/v1/files/${fileKey}`;
    if (nodeId) {
      apiUrl += `/nodes?ids=${encodeURIComponent(nodeId)}`;
    }

    console.log('Fetching Figma data:', apiUrl);

    const figmaResponse = await fetch(apiUrl, {
      headers: {
        'X-Figma-Token': FIGMA_TOKEN,
      },
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
    
    // Extract the root node
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

    // Process the node tree into our simplified format
    const processedDesign = processNode(rootNode);

    // Collect all image refs for export
    const imageRefs: string[] = [];
    const collectImageRefs = (node: any) => {
      if (node.imageRef) imageRefs.push(node.imageRef);
      if (node.children) node.children.forEach(collectImageRefs);
    };
    collectImageRefs(processedDesign);

    // If there are images, fetch their URLs
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

    // Also export node as PNG for reference
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
