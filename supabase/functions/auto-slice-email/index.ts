import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// STEP 1: ADD RULER TO IMAGE
// ============================================================================

function addRulerToImage(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number = 4
): { pixels: Uint8Array; newWidth: number } {
  
  const rulerWidth = 50;
  const newWidth = width + rulerWidth;
  const newPixels = new Uint8Array(newWidth * height * channels);
  
  // Fill ruler area with white background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rulerWidth; x++) {
      const idx = (y * newWidth + x) * channels;
      newPixels[idx] = 255;     // R
      newPixels[idx + 1] = 255; // G
      newPixels[idx + 2] = 255; // B
      newPixels[idx + 3] = 255; // A
    }
  }
  
  // Copy original image to the right of ruler
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const dstIdx = (y * newWidth + (x + rulerWidth)) * channels;
      newPixels[dstIdx] = pixels[srcIdx];
      newPixels[dstIdx + 1] = pixels[srcIdx + 1];
      newPixels[dstIdx + 2] = pixels[srcIdx + 2];
      newPixels[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  
  // Draw ruler markings (0 to 200)
  for (let mark = 0; mark <= 200; mark++) {
    const y = Math.round((mark / 200) * (height - 1));
    
    const isMajor = mark % 20 === 0;
    const isMedium = mark % 10 === 0;
    const isMinor = mark % 5 === 0;
    const tickLength = isMajor ? 25 : (isMedium ? 18 : (isMinor ? 12 : 6));
    
    // Draw tick mark (black line)
    for (let x = rulerWidth - tickLength; x < rulerWidth; x++) {
      const idx = (y * newWidth + x) * channels;
      newPixels[idx] = 0;
      newPixels[idx + 1] = 0;
      newPixels[idx + 2] = 0;
      newPixels[idx + 3] = 255;
    }
    
    // Draw number for major ticks
    if (isMajor) {
      drawNumber(newPixels, newWidth, height, channels, mark, 2, y - 4);
    }
  }
  
  // Draw vertical line at ruler edge
  for (let y = 0; y < height; y++) {
    const idx = (y * newWidth + (rulerWidth - 1)) * channels;
    newPixels[idx] = 0;
    newPixels[idx + 1] = 0;
    newPixels[idx + 2] = 0;
    newPixels[idx + 3] = 255;
  }
  
  return { pixels: newPixels, newWidth };
}

// Simple pixel font for digits (3x5 patterns)
const DIGIT_PATTERNS: Record<string, number[][]> = {
  '0': [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
  '2': [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
  '3': [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
  '4': [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
  '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '6': [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  '8': [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
  '9': [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
};

function drawNumber(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
  num: number,
  startX: number,
  startY: number
): void {
  const digits = num.toString().split('');
  let offsetX = 0;
  
  for (const digit of digits) {
    const pattern = DIGIT_PATTERNS[digit];
    if (!pattern) continue;
    
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col]) {
          const px = startX + offsetX + col;
          const py = startY + row;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * channels;
            pixels[idx] = 0;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = 255;
          }
        }
      }
    }
    offsetX += 4;
  }
}

// ============================================================================
// STEP 2: ASK CLAUDE TO READ THE RULER
// ============================================================================

async function askClaudeForSlicePositions(
  rulerImageBase64: string,
  mediaType: string
): Promise<{ cuts: number[]; sections: { type: string; label: string }[] }> {
  
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const prompt = `You are analyzing an email marketing image that has a vertical ruler (0-200) on the left side. Each mark represents 0.5% of the image height.

Your task: Look at where the major section boundaries are in the email, and tell me what number on the ruler aligns with each boundary.

## What counts as a section boundary:
- Between header/logo and hero content
- Between hero and product areas
- Between text blocks and CTA buttons  
- Between different content sections
- Between main content and footer

## What is NOT a boundary:
- Between paragraphs in the same text block
- Between a headline and its subheadline
- Small gaps within a cohesive section

## Instructions:
1. Look at the email content (ignore the ruler itself)
2. Identify where distinct sections begin and end
3. For each boundary, read the number on the ruler at that vertical position
4. Return those numbers (they will be between 0 and 200)

Most emails have 3-10 major sections, so you should return 2-9 cut points.

Respond with JSON only:

{
  "cuts": [30, 76, 104, 142, 178],
  "sections": [
    { "type": "header", "label": "Logo and top banner" },
    { "type": "hero", "label": "Main headline and offer" },
    { "type": "cta_button", "label": "Primary call-to-action" },
    { "type": "content", "label": "Product details" },
    { "type": "social", "label": "Social proof section" },
    { "type": "footer", "label": "Footer links and unsubscribe" }
  ]
}

The "sections" array describes each section from top to bottom (should have one more entry than "cuts").
The "cuts" array contains the ruler numbers (0-200) where you'd slice the email.`;

  console.log("Calling Claude API...");
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: rulerImageBase64
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Claude API error:", error);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  console.log("Claude response:", content);
  
  // Parse JSON from response
  let jsonStr = content;
  if (content.includes("```json")) {
    jsonStr = content.split("```json")[1].split("```")[0];
  } else if (content.includes("```")) {
    jsonStr = content.split("```")[1].split("```")[0];
  }
  
  return JSON.parse(jsonStr.trim());
}

// ============================================================================
// STEP 3: CONVERT TO SLICES
// ============================================================================

interface SliceResult {
  id: string;
  yStartPercent: number;
  yEndPercent: number;
  type: string;
  label: string;
  clickable: boolean;
}

function convertToSlices(
  cuts: number[],
  sections: { type: string; label: string }[]
): SliceResult[] {
  
  // Sort cuts and add boundaries (0 and 200)
  const sortedCuts = [...cuts].sort((a, b) => a - b);
  const boundaries = [0, ...sortedCuts, 200];
  
  const slices: SliceResult[] = [];
  
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sectionInfo = sections[i] || { type: 'content', label: `Section ${i + 1}` };
    
    slices.push({
      id: `slice_${i + 1}`,
      yStartPercent: boundaries[i] / 2,  // Divide by 2 to convert 0-200 → 0-100%
      yEndPercent: boundaries[i + 1] / 2,
      type: sectionInfo.type,
      label: sectionInfo.label,
      clickable: !['divider', 'spacer'].includes(sectionInfo.type)
    });
  }
  
  return slices;
}

// ============================================================================
// PNG ENCODING/DECODING
// ============================================================================

// CRC32 lookup table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePngSimple(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // Create raw image data with filter bytes
  const rawData: number[] = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // Filter type: None
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
    }
  }
  
  const rawBytes = new Uint8Array(rawData);
  
  // Simple DEFLATE with no compression (stored blocks)
  const deflated = deflateStore(rawBytes);
  
  // Build PNG chunks
  const chunks: Uint8Array[] = [];
  
  // PNG signature
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  
  // IHDR chunk
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 6;  // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  chunks.push(makeChunk('IHDR', ihdr));
  
  // IDAT chunk(s)
  chunks.push(makeChunk('IDAT', deflated));
  
  // IEND chunk
  chunks.push(makeChunk('IEND', new Uint8Array(0)));
  
  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  
  // Length
  view.setUint32(0, data.length, false);
  
  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  
  // Data
  chunk.set(data, 8);
  
  // CRC (over type + data)
  const crcData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) {
    crcData[i] = type.charCodeAt(i);
  }
  crcData.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcData), false);
  
  return chunk;
}

function deflateStore(data: Uint8Array): Uint8Array {
  // zlib header (no compression)
  const result: number[] = [0x78, 0x01];
  
  // Split into 65535-byte blocks (max for stored blocks)
  const maxBlockSize = 65535;
  let offset = 0;
  
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(remaining, maxBlockSize);
    const isLast = offset + blockSize >= data.length;
    
    // Block header
    result.push(isLast ? 0x01 : 0x00); // BFINAL + BTYPE (stored)
    result.push(blockSize & 0xff);
    result.push((blockSize >> 8) & 0xff);
    result.push((~blockSize) & 0xff);
    result.push(((~blockSize) >> 8) & 0xff);
    
    // Block data
    for (let i = 0; i < blockSize; i++) {
      result.push(data[offset + i]);
    }
    
    offset += blockSize;
  }
  
  // Adler-32 checksum
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = (b << 16) | a;
  result.push((adler >> 24) & 0xff);
  result.push((adler >> 16) & 0xff);
  result.push((adler >> 8) & 0xff);
  result.push(adler & 0xff);
  
  return new Uint8Array(result);
}

// ============================================================================
// IMAGE DECODING
// ============================================================================

interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

async function decodeImageFromDataUrl(dataUrl: string): Promise<DecodedImage> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL format");
  }
  
  const format = match[1];
  const base64Data = match[2];
  const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  if (format === 'png') {
    return decodePng(imageBuffer);
  } else {
    throw new Error(`Image format ${format} not directly supported. Please use PNG.`);
  }
}

function decodePng(data: Uint8Array): DecodedImage {
  // Verify PNG signature
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== signature[i]) {
      throw new Error("Invalid PNG signature");
    }
  }
  
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const compressedData: number[] = [];
  
  let offset = 8;
  while (offset < data.length) {
    const view = new DataView(data.buffer, data.byteOffset + offset);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
    
    if (type === 'IHDR') {
      width = view.getUint32(8, false);
      height = view.getUint32(12, false);
      bitDepth = data[offset + 16];
      colorType = data[offset + 17];
    } else if (type === 'IDAT') {
      for (let i = 0; i < length; i++) {
        compressedData.push(data[offset + 8 + i]);
      }
    } else if (type === 'IEND') {
      break;
    }
    
    offset += 12 + length;
  }
  
  // Decompress using inflate
  const inflated = inflate(new Uint8Array(compressedData));
  
  // Determine channels based on color type
  let channels = 4;
  if (colorType === 0) channels = 1;
  else if (colorType === 2) channels = 3;
  else if (colorType === 4) channels = 2;
  else if (colorType === 6) channels = 4;
  
  // Unfilter
  const bytesPerPixel = channels * (bitDepth / 8);
  const scanlineLength = 1 + width * bytesPerPixel;
  const pixels = new Uint8Array(width * height * 4);
  
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * scanlineLength];
    const scanlineStart = y * scanlineLength + 1;
    const prevScanlineStart = (y - 1) * scanlineLength + 1;
    
    for (let x = 0; x < width * bytesPerPixel; x++) {
      let val = inflated[scanlineStart + x];
      const a = x >= bytesPerPixel ? inflated[scanlineStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? inflated[prevScanlineStart + x] : 0;
      const c = (x >= bytesPerPixel && y > 0) ? inflated[prevScanlineStart + x - bytesPerPixel] : 0;
      
      switch (filterType) {
        case 0: break;
        case 1: val = (val + a) & 0xff; break;
        case 2: val = (val + b) & 0xff; break;
        case 3: val = (val + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: val = (val + paethPredictor(a, b, c)) & 0xff; break;
      }
      
      inflated[scanlineStart + x] = val;
    }
    
    // Convert to RGBA
    for (let x = 0; x < width; x++) {
      const srcIdx = scanlineStart + x * bytesPerPixel;
      const dstIdx = (y * width + x) * 4;
      
      if (colorType === 6) {
        pixels[dstIdx] = inflated[srcIdx];
        pixels[dstIdx + 1] = inflated[srcIdx + 1];
        pixels[dstIdx + 2] = inflated[srcIdx + 2];
        pixels[dstIdx + 3] = inflated[srcIdx + 3];
      } else if (colorType === 2) {
        pixels[dstIdx] = inflated[srcIdx];
        pixels[dstIdx + 1] = inflated[srcIdx + 1];
        pixels[dstIdx + 2] = inflated[srcIdx + 2];
        pixels[dstIdx + 3] = 255;
      } else if (colorType === 0) {
        const gray = inflated[srcIdx];
        pixels[dstIdx] = gray;
        pixels[dstIdx + 1] = gray;
        pixels[dstIdx + 2] = gray;
        pixels[dstIdx + 3] = 255;
      } else if (colorType === 4) {
        const gray = inflated[srcIdx];
        pixels[dstIdx] = gray;
        pixels[dstIdx + 1] = gray;
        pixels[dstIdx + 2] = gray;
        pixels[dstIdx + 3] = inflated[srcIdx + 1];
      }
    }
  }
  
  return { width, height, pixels };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Simplified zlib inflate
function inflate(data: Uint8Array): Uint8Array {
  let pos = 2; // Skip zlib header
  const output: number[] = [];
  
  while (pos < data.length - 4) {
    const header = data[pos++];
    const isFinal = header & 1;
    const type = (header >> 1) & 3;
    
    if (type === 0) {
      const len = data[pos] | (data[pos + 1] << 8);
      pos += 4;
      for (let i = 0; i < len; i++) {
        output.push(data[pos++]);
      }
    } else if (type === 1 || type === 2) {
      const result = inflateHuffman(data, pos, type === 2);
      output.push(...result.data);
      pos = result.pos;
    }
    
    if (isFinal) break;
  }
  
  return new Uint8Array(output);
}

function inflateHuffman(data: Uint8Array, startPos: number, dynamic: boolean): { data: number[]; pos: number } {
  const output: number[] = [];
  let bitPos = 0;
  let pos = startPos;
  
  function readBits(n: number): number {
    let result = 0;
    for (let i = 0; i < n; i++) {
      const byteOffset = pos + Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      if ((data[byteOffset] >> bitOffset) & 1) {
        result |= 1 << i;
      }
      bitPos++;
    }
    return result;
  }
  
  const litLenCodes: number[] = [];
  const distCodes: number[] = [];
  
  if (!dynamic) {
    for (let i = 0; i <= 143; i++) litLenCodes.push(8);
    for (let i = 144; i <= 255; i++) litLenCodes.push(9);
    for (let i = 256; i <= 279; i++) litLenCodes.push(7);
    for (let i = 280; i <= 287; i++) litLenCodes.push(8);
    for (let i = 0; i < 32; i++) distCodes.push(5);
  } else {
    const hlit = readBits(5) + 257;
    const hdist = readBits(5) + 1;
    const hclen = readBits(4) + 4;
    
    const codeLenOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    const codeLenLengths = new Array(19).fill(0);
    
    for (let i = 0; i < hclen; i++) {
      codeLenLengths[codeLenOrder[i]] = readBits(3);
    }
    
    const codeLenTree = buildHuffmanTree(codeLenLengths);
    
    const allLengths: number[] = [];
    while (allLengths.length < hlit + hdist) {
      const sym = readHuffman(codeLenTree, () => readBits(1));
      if (sym < 16) {
        allLengths.push(sym);
      } else if (sym === 16) {
        const repeat = readBits(2) + 3;
        const last = allLengths[allLengths.length - 1] || 0;
        for (let i = 0; i < repeat; i++) allLengths.push(last);
      } else if (sym === 17) {
        const repeat = readBits(3) + 3;
        for (let i = 0; i < repeat; i++) allLengths.push(0);
      } else if (sym === 18) {
        const repeat = readBits(7) + 11;
        for (let i = 0; i < repeat; i++) allLengths.push(0);
      }
    }
    
    for (let i = 0; i < hlit; i++) litLenCodes.push(allLengths[i]);
    for (let i = 0; i < hdist; i++) distCodes.push(allLengths[hlit + i]);
  }
  
  const litLenTree = buildHuffmanTree(litLenCodes);
  const distTree = buildHuffmanTree(distCodes);
  
  const lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const distBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const distExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  
  while (true) {
    const sym = readHuffman(litLenTree, () => readBits(1));
    
    if (sym === 256) break;
    
    if (sym < 256) {
      output.push(sym);
    } else {
      const lenIdx = sym - 257;
      const length = lengthBase[lenIdx] + readBits(lengthExtra[lenIdx]);
      
      const distSym = readHuffman(distTree, () => readBits(1));
      const distance = distBase[distSym] + readBits(distExtra[distSym]);
      
      for (let i = 0; i < length; i++) {
        output.push(output[output.length - distance]);
      }
    }
  }
  
  pos += Math.ceil(bitPos / 8);
  
  return { data: output, pos };
}

interface HuffmanNode {
  symbol?: number;
  left?: HuffmanNode;
  right?: HuffmanNode;
}

function buildHuffmanTree(lengths: number[]): HuffmanNode {
  const maxLen = Math.max(...lengths);
  const blCount = new Array(maxLen + 1).fill(0);
  
  for (const len of lengths) {
    if (len > 0) blCount[len]++;
  }
  
  const nextCode = new Array(maxLen + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }
  
  const root: HuffmanNode = {};
  
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len === 0) continue;
    
    let node = root;
    const codeVal = nextCode[len]++;
    
    for (let bit = len - 1; bit >= 0; bit--) {
      const isRight = (codeVal >> bit) & 1;
      if (isRight) {
        if (!node.right) node.right = {};
        node = node.right;
      } else {
        if (!node.left) node.left = {};
        node = node.left;
      }
    }
    node.symbol = i;
  }
  
  return root;
}

function readHuffman(tree: HuffmanNode, readBit: () => number): number {
  let node = tree;
  while (node.symbol === undefined) {
    const bit = readBit();
    node = bit ? (node.right || node) : (node.left || node);
  }
  return node.symbol;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { imageDataUrl } = await req.json();
    
    if (!imageDataUrl) {
      throw new Error("imageDataUrl is required");
    }

    console.log("Starting ruler-based auto-slice...");

    // Decode image
    const decoded = await decodeImageFromDataUrl(imageDataUrl);
    const { width, height, pixels } = decoded;
    console.log(`Original image: ${width}x${height}`);

    // Step 1: Add ruler to image
    console.log("Adding ruler to image...");
    const { pixels: rulerPixels, newWidth } = addRulerToImage(pixels, width, height, 4);
    
    // Encode ruler image as PNG
    console.log("Encoding ruler image...");
    const rulerPng = encodePngSimple(rulerPixels, newWidth, height);
    const rulerBase64 = btoa(String.fromCharCode(...rulerPng));
    console.log(`Ruler image: ${newWidth}x${height}, ${rulerPng.length} bytes`);

    // Step 2: Ask Claude to read positions from ruler
    console.log("Asking Claude to identify slice positions...");
    const claudeResponse = await askClaudeForSlicePositions(rulerBase64, 'image/png');
    console.log(`Claude returned cuts: [${claudeResponse.cuts.join(', ')}]`);

    // Step 3: Convert to slices
    const slices = convertToSlices(claudeResponse.cuts, claudeResponse.sections);
    console.log(`Generated ${slices.length} slices`);

    const processingTimeMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        slices,
        metadata: {
          imageWidth: width,
          imageHeight: height,
          processingTimeMs
        },
        debug: {
          cuts: claudeResponse.cuts,
          sections: claudeResponse.sections
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error("Auto-slice error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        slices: [],
        metadata: {
          imageWidth: 0,
          imageHeight: 0,
          processingTimeMs: Date.now() - startTime
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
