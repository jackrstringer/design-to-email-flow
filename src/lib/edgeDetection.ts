/**
 * Frontend edge detection using Canvas API
 * Moves CPU-heavy edge detection off the backend (200ms CPU limit)
 * to the browser (unlimited CPU)
 */

export interface HorizontalEdge {
  y: number;
  strength: number;
}

/**
 * Detect horizontal color edges in an image
 * Returns edges in original image coordinates
 */
export async function detectHorizontalEdges(
  imageDataUrl: string
): Promise<HorizontalEdge[]> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.warn('Could not get canvas context for edge detection');
        resolve([]);
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const edges: HorizontalEdge[] = [];
      
      // Match backend sampling rates
      const ROW_SAMPLE_RATE = 5;
      const PIXEL_SAMPLE_RATE = 10;
      
      let previousRowAvg = getRowAverage(pixels, 0, width, PIXEL_SAMPLE_RATE);
      
      for (let y = ROW_SAMPLE_RATE; y < height; y += ROW_SAMPLE_RATE) {
        const currentRowAvg = getRowAverage(pixels, y, width, PIXEL_SAMPLE_RATE);
        const diff = colorDistance(previousRowAvg, currentRowAvg);
        
        // Only record significant edges (threshold ~35)
        if (diff > 35) {
          edges.push({
            y: y,
            strength: Math.min(diff / 100, 1)
          });
        }
        
        previousRowAvg = currentRowAvg;
      }
      
      // Filter to strong edges (strength > 0.5), take top 30 by strength, sort by Y
      const strongEdges = edges
        .filter(e => e.strength > 0.5)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 30)
        .sort((a, b) => a.y - b.y);
      
      console.log(`Frontend edge detection: found ${strongEdges.length} edges (from ${edges.length} raw)`);
      resolve(strongEdges);
    };
    
    img.onerror = () => {
      console.warn('Failed to load image for edge detection');
      resolve([]);
    };
    
    img.src = imageDataUrl;
  });
}

function getRowAverage(
  pixels: Uint8ClampedArray, 
  y: number, 
  width: number,
  sampleRate: number
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0, count = 0;
  
  for (let x = 0; x < width; x += sampleRate) {
    const i = (y * width + x) * 4;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    count++;
  }
  
  return { 
    r: r / count, 
    g: g / count, 
    b: b / count 
  };
}

function colorDistance(
  c1: { r: number; g: number; b: number }, 
  c2: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}
